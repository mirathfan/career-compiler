//! Native transactions retain one connection across repository calls. Tokens are
//! random, process-local and short-lived; process exit/timeout rolls back SQLite.
use sqlx::Connection;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

type Session = Arc<AsyncMutex<Option<sqlx::SqliteConnection>>>;
#[derive(Default, Clone)]
pub struct TransactionState(Arc<Mutex<HashMap<String, Session>>>);

pub(crate) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(root) = crate::acceptance::root_for_identifier(&app.config().identifier)? {
        return Ok(root.join("native.sqlite3"));
    }
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("careercompiler.db"))
}

pub(crate) async fn connect(path: &std::path::Path) -> Result<sqlx::SqliteConnection, String> {
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Database symlinks are not permitted.".into());
    }
    // Never create a database through the transaction command. Initialize/migrate first.
    let mut connection =
        sqlx::SqliteConnection::connect(&format!("sqlite:{}?mode=rw", path.display()))
            .await
            .map_err(|error| error.to_string())?;
    sqlx::query("PRAGMA foreign_keys=ON")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("PRAGMA busy_timeout=10000")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
pub async fn transaction_begin(
    app: tauri::AppHandle,
    state: tauri::State<'_, TransactionState>,
) -> Result<String, String> {
    let mut connection = connect(&database_path(&app)?).await?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    let id = format!(
        "{:032x}{:032x}",
        rand::random::<u128>(),
        rand::random::<u128>()
    );
    let session = Arc::new(AsyncMutex::new(Some(connection)));
    state
        .0
        .lock()
        .map_err(|_| "Transaction registry unavailable")?
        .insert(id.clone(), session);
    let registry = state.inner().clone();
    let expires = id.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(120)).await;
        let session = registry
            .0
            .lock()
            .ok()
            .and_then(|mut map| map.remove(&expires));
        if let Some(session) = session {
            if let Some(mut connection) = session.lock().await.take() {
                let _ = sqlx::query("ROLLBACK").execute(&mut connection).await;
            }
        }
    });
    Ok(id)
}

#[tauri::command]
pub async fn transaction_query(
    state: tauri::State<'_, TransactionState>,
    id: String,
    query: String,
    values: Vec<serde_json::Value>,
    select: bool,
) -> Result<serde_json::Value, String> {
    crate::acceptance::validate_query(&query)?;
    let first = query
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_uppercase();
    if !["SELECT", "INSERT", "UPDATE", "DELETE"].contains(&first.as_str())
        || query
            .split(';')
            .filter(|part| !part.trim().is_empty())
            .count()
            > 1
    {
        return Err(
            "Only one data statement is allowed; transaction control is native-only.".into(),
        );
    }
    let session = state
        .0
        .lock()
        .map_err(|_| "Transaction registry unavailable")?
        .get(&id)
        .cloned()
        .ok_or("Transaction expired or unavailable")?;
    let mut guard = session.lock().await;
    let connection = guard.as_mut().ok_or("Transaction closed")?;
    crate::acceptance::query_connection(connection, query, values, select).await
}

#[tauri::command]
pub async fn transaction_finish(
    state: tauri::State<'_, TransactionState>,
    id: String,
    commit: bool,
) -> Result<(), String> {
    let session = state
        .0
        .lock()
        .map_err(|_| "Transaction registry unavailable")?
        .remove(&id)
        .ok_or("Transaction expired or unavailable")?;
    let mut guard = session.lock().await;
    let mut connection = guard.take().ok_or("Transaction closed")?;
    sqlx::query(if commit { "COMMIT" } else { "ROLLBACK" })
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) async fn mark_live_attempt(
    app: &tauri::AppHandle,
    input: &serde_json::Value,
    repair: bool,
) -> Result<(), String> {
    use sqlx::Row;
    let id = input
        .get("budgetAttemptId")
        .and_then(|value| value.as_str())
        .ok_or("ai_reservation_required|A committed budget reservation is required.")?;
    let job_id = input
        .pointer("/job/id")
        .and_then(|value| value.as_str())
        .ok_or("Missing reserved job")?;
    let mut connection = connect(&database_path(app)?).await?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    let record =
        sqlx::query("SELECT value_json FROM safety_records WHERE kind='ai_budget' AND id=?")
            .bind(id)
            .fetch_optional(&mut connection)
            .await
            .map_err(|error| error.to_string())?
            .ok_or("Unknown AI reservation")?;
    let mut value: serde_json::Value = serde_json::from_str(record.get::<&str, _>("value_json"))
        .map_err(|_| "Invalid reservation")?;
    let day: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%d','now')")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    let job_hash: Option<String> = sqlx::query_scalar("SELECT content_hash FROM jobs WHERE id=?")
        .bind(job_id)
        .fetch_optional(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    let preferences: String = sqlx::query_scalar("SELECT preferences_json FROM job_search_preferences WHERE id='job-search-preferences-default'").fetch_one(&mut connection).await.map_err(|error| error.to_string())?;
    let preferences: serde_json::Value =
        serde_json::from_str(&preferences).map_err(|_| "Invalid AI preferences")?;
    let count = value["attemptedCalls"].as_u64().unwrap_or(0);
    if value["provider"] != "openai"
        || value["day"] != day
        || value["jobId"] != job_id
        || value["fingerprint"].as_str() != job_hash.as_deref()
        || input
            .pointer("/job/contentHash")
            .and_then(|value| value.as_str())
            != job_hash.as_deref()
        || count != if repair { 1 } else { 0 }
        || value["state"] == "finished"
        || preferences["aiMatchEnabled"] != true
        || preferences["aiMatchMockMode"] != false
    {
        return Err(
            "ai_reservation_invalid|Expired, stale, replayed or disabled AI reservation.".into(),
        );
    }
    value["attemptedCalls"] = (count + 1).into();
    value["state"] = "attempted".into();
    sqlx::query("UPDATE safety_records SET value_json=? WHERE kind='ai_budget' AND id=?")
        .bind(value.to_string())
        .bind(id)
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("COMMIT")
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dropped_connection_rolls_back_and_restart_reads_committed_state() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "careercompiler-transaction-{}.sqlite",
                rand::random::<u128>()
            ));
            let mut initial =
                sqlx::SqliteConnection::connect(&format!("sqlite:{}?mode=rwc", path.display()))
                    .await
                    .unwrap();
            sqlx::query("CREATE TABLE state(value INTEGER)")
                .execute(&mut initial)
                .await
                .unwrap();
            sqlx::query("INSERT INTO state VALUES(1)")
                .execute(&mut initial)
                .await
                .unwrap();
            initial.close().await.unwrap();
            let mut interrupted = connect(&path).await.unwrap();
            sqlx::query("BEGIN IMMEDIATE")
                .execute(&mut interrupted)
                .await
                .unwrap();
            sqlx::query("UPDATE state SET value=2")
                .execute(&mut interrupted)
                .await
                .unwrap();
            interrupted.close().await.unwrap();
            let mut restarted = connect(&path).await.unwrap();
            let value: i64 = sqlx::query_scalar("SELECT value FROM state")
                .fetch_one(&mut restarted)
                .await
                .unwrap();
            assert_eq!(value, 1);
            sqlx::query("BEGIN IMMEDIATE")
                .execute(&mut restarted)
                .await
                .unwrap();
            sqlx::query("UPDATE state SET value=3")
                .execute(&mut restarted)
                .await
                .unwrap();
            sqlx::query("COMMIT").execute(&mut restarted).await.unwrap();
            restarted.close().await.unwrap();
            let mut reopened = connect(&path).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT value FROM state")
                    .fetch_one(&mut reopened)
                    .await
                    .unwrap(),
                3
            );
            reopened.close().await.unwrap();
            std::fs::remove_file(path).unwrap();
        });
    }
}
