# Rust Optimizer Reference

## Public Surface Extraction (cargo expand or manual)
- `pub struct Name { ... }` → keep fields if <8, else "contains id, name, metadata, timestamps"
- `pub enum` → full variants (they are usually the API contract)
- `pub trait` → all method signatures
- `impl` blocks: only `pub fn` signatures + "uses thiserror, anyhow, or ? operator for error handling"
- For axum/Actix-web handlers: route + extractors + "returns Result<Json<T>, AppError>"

## Tokio / Async Specific
- `async fn` → keep signature, note if it uses `spawn`, `select!`, `join!`, or channels
- Error handling: "Propagates via `?` with custom `#[derive(thiserror::Error)]` enum"

## Example Compressed Form
```rust
// crates/domain/src/user.rs (734 LOC → 71 tokens)
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    // ... 4 more fields (full definition in source)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Role { Admin, User, Moderator }

pub trait UserRepository {
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, RepositoryError>;
    async fn insert(&self, user: &User) -> Result<(), RepositoryError>;
    // 3 more methods
}

pub struct PostgresUserRepository { pool: PgPool }

impl UserRepository for PostgresUserRepository {
    async fn find_by_email(...) { /* sqlx query, maps row to User */ }
    // ...
}

// In binary crate:
#[tokio::main]
async fn main() {
    // tracing_subscriber init, axum router with /users routes, graceful shutdown
}
```
