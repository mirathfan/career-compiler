use super::*;
use serde_json::Value;

pub(super) async fn synthetic_fixture(records: bool, fts: bool) -> Result<SyntheticDatabase> {
    let mut db = SyntheticDatabase::create().await?;
    db.conn()?.execute("PRAGMA journal_mode=WAL").await?;
    db.conn()?.execute("PRAGMA wal_autocheckpoint=0").await?;
    initialize_011(db.conn()?).await?;
    if records {
        let tables: Vec<Value> = serde_json::from_str(include_str!("legacy-records.json"))
            .map_err(|_| Failure::Schema)?;
        let c = db.conn()?;
        c.execute("PRAGMA foreign_keys=OFF").await?;
        c.execute("BEGIN IMMEDIATE").await?;
        for table in tables {
            let name = table["name"].as_str().unwrap();
            let columns = table["columns"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| quoted(v.as_str().unwrap()))
                .collect::<Vec<_>>();
            let sql = format!(
                "INSERT INTO {} ({}) VALUES ({})",
                quoted(name),
                columns.join(","),
                vec!["?"; columns.len()].join(",")
            );
            for row in table["values"].as_array().unwrap() {
                let mut q = sqlx::query(&sql);
                for v in row.as_array().unwrap() {
                    q = match v {
                        Value::Null => q.bind(None::<String>),
                        Value::String(s) => q.bind(s),
                        Value::Number(n) if n.is_i64() => q.bind(n.as_i64().unwrap()),
                        Value::Number(n) => q.bind(n.as_f64().unwrap()),
                        _ => panic!("Unsupported synthetic fixture value"),
                    };
                }
                q.execute(&mut *c).await?;
            }
        }
        c.execute("COMMIT").await?;
        c.execute("PRAGMA foreign_keys=ON").await?;
        integrity(c).await?;
    }
    if fts {
        db.conn()?.execute(FTS).await?;
        db.conn()?.execute("INSERT INTO search_documents_fts VALUES('synthetic-document','Synthetic job','Synthetic evidence')").await?;
    }
    Ok(db)
}
