# Agent Tools

Career Copilot separates read tools from proposed write tools.

Read tools implemented in the local deterministic path include:

- `search_career_memory`
- `search_applications`
- `compare_resumes`
- `recommend_base_resumes`
- exact job/application/resume lookups through repository context

Write tools are represented as pending action proposals:

- `update_application_status`
- `add_application_note`
- `link_resume_to_application`
- `favorite_resume`
- `archive_resume`
- `save_approved_answer`
- `create_job_from_chat`
- `create_resume_from_base`

Pending actions show affected records, before values, and after values. The repository confirms supported actions transactionally and marks cancelled actions without applying changes.
