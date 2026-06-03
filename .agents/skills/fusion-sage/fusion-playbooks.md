# Fusion Playbooks — Language-Specific Synthesis Rules

Portable defaults. **devprofile** overlay: [references/devprofile-fusion-playbook.md](references/devprofile-fusion-playbook.md).

These extend the original language compression rules with **active fusion/synthesis** logic.

---

## Python & ML/AI Fusion Playbook

### Synthesis Rules
After AST extraction and relevance scoring:

1. **Domain Aggregate Fusion**
   - Scan for classes that share the same domain (e.g., User, UserRepository, UserService, UserEvent)
   - Fuse into: `UserAggregate` (state machine + command handlers + events)

2. **Event-Driven Pattern Detection**
   - If you see multiple `def handle_*` or `@event_handler` style methods → propose `EventBus` + `DomainEvents`

3. **ML Model Fusion**
   - For `nn.Module` subclasses: detect encoder/decoder pairs or multi-task heads → fuse into `UnifiedModel` with shared backbone + task-specific heads

### Example Synthesis Output
```python
# BEFORE (fission output)
class User(BaseModel): ...
class UserRepository: ...
class UserService: ...
class UserCreatedEvent: ...

# AFTER (fusion output)
@dataclass
class UserAggregate:
    """Fused User domain reactor — state machine + event sourcing ready."""
    user: User
    repo: UserRepository
    event_bus: EventBus

    def create(self, data: dict) -> UserCreatedEvent:
        user = self.repo.create(data)
        event = UserCreatedEvent(user.id)
        self.event_bus.publish(event)
        return event
```

**Q Improvement**: +340 future tokens saved per auth-related query.

---

## TypeScript / React / Node Fusion Playbook

### Synthesis Rules
1. **Feature Reactor Fusion**
   - Merge: Custom hook + Context Provider + Service + Types → single `useFeatureReactor()` hook with internal state machine

2. **API + State Fusion**
   - Detect REST/GraphQL calls + local state + loading/error → fuse into `useQueryReactor` with optimistic updates + cache invalidation built-in

3. **Component + Logic Fusion**
   - Client component + hook + shared types → propose **client** `FeatureReactor` (not Server Components for UI state in devprofile)

### Example Synthesis Output
```tsx
// BEFORE (fission)
function useUser() { ... }
const UserContext = createContext(...)
export function UserProvider({ children }) { ... }
export function UserService() { ... }

// AFTER (fusion)
export function useUserReactor() {
  const [state, dispatch] = useReducer(userReducer, initialState)
  
  const createUser = useCallback(async (data) => {
    dispatch({ type: 'CREATE_START' })
    const user = await api.createUser(data)
    dispatch({ type: 'CREATE_SUCCESS', user })
    eventBus.emit(new UserCreatedEvent(user))
  }, [])

  return { state, createUser, ... }
}
```

**Q Improvement**: +520 future tokens saved across auth flows.

---

## Rust Fusion Playbook

### Synthesis Rules
1. **Ownership + Trait Fusion**
   - Multiple structs with similar `impl` blocks → propose newtype + blanket trait impls

2. **Async Reactor Pattern**
   - Multiple `async fn` that share state → fuse into `tokio::sync::watch` or `flume` channel + single reactor task

3. **Error + Domain Fusion**
   - Multiple custom error enums → fuse into `thiserror` + `DomainError` with `#[from]` for all sub-errors

### Example Synthesis Output
```rust
// BEFORE (fission)
pub struct User { ... }
pub struct UserRepo { pool: PgPool }
impl UserRepo { async fn find_by_email(...) }
pub enum UserError { ... }

// AFTER (fusion)
#[derive(thiserror::Error)]
pub enum DomainError {
    #[error("user error: {0}")]
    User(#[from] UserError),
    // ... other domains
}

pub struct UserReactor {
    repo: UserRepo,
    event_tx: mpsc::Sender<DomainEvent>,
}

impl UserReactor {
    pub async fn create_user(&self, data: CreateUser) -> Result<User, DomainError> {
        let user = self.repo.insert(data).await?;
        self.event_tx.send(DomainEvent::UserCreated(user.id)).await?;
        Ok(user)
    }
}
```

**Q Improvement**: +280 future tokens saved on domain-heavy modules.

---

## General Cross-Language Fusion Heuristics

- **State Machine Detection**: Any code with many `match` / `if let` on status fields → propose explicit state machine (e.g., `strum` + `StateMachine` trait)
- **Event Sourcing Pattern**: Multiple "log this action" calls → fuse into `EventStore` + replay capability
- **Cross-Cutting Concern Fusion**: Logging, metrics, tracing, auth checks appearing in 5+ places → propose `MiddlewareReactor` or `Aspect` layer

**Rule of Thumb**: If 3+ files touch the same conceptual "thing", they deserve a fused abstraction.