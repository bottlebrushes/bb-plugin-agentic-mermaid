# Mermaid renderer gallery

## Gantt

```mermaid
gantt
  title Mermaid plugin rollout
  dateFormat YYYY-MM-DD
  section Research
  Compare renderers   :done, r1, 2026-10-01, 2d
  Pick library        :milestone, m1, after r1, 0d
  section Build
  Content script      :active, b1, after r1, 4d
  Theme mapping       :b2, after r1, 3d
  Fallback path       :b3, after b2, 2d
  section Ship
  Marketplace PR      :crit, s1, after b1, 2d
```


## Flowchart with subgraphs

```mermaid
flowchart LR
  subgraph Client
    U[User] --> UI[bb app]
  end
  subgraph Daemon
    UI -->|RPC| S[Server]
    S --> Q{Thread idle?}
    Q -->|yes| P[Provider]
    Q -->|no| W[Queue turn]
    W --> P
  end
  P -->|tool call| T[(Workspace)]
  T -->|result| P
  P -->|stream| UI
```


## Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant B as bb server
  participant A as Agent
  participant T as Tool
  U->>B: send message
  B->>A: start turn
  loop until done
    A->>T: tool call
    T-->>A: result
  end
  A-->>B: final answer
  Note over B,A: timeline persisted
  B-->>U: render
```


## State

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: turn started
  Running --> Waiting: needs input
  Waiting --> Running: user replied
  Running --> Idle: turn complete
  Running --> Failed: provider error
  Failed --> Idle: retry
  Idle --> [*]: archived
```


## Class

```mermaid
classDiagram
  class Project {
    +string id
    +string name
    +threads() Thread[]
  }
  class Thread {
    +string id
    +string status
    +send(msg) void
  }
  class Environment {
    +string kind
    +string path
  }
  Project "1" --> "*" Thread
  Thread --> Environment
```


## ER (includes the }o--|| relation beautiful-mermaid drops)

```mermaid
erDiagram
  PROJECT ||--o{ THREAD : contains
  THREAD ||--|{ TURN : has
  THREAD }o--|| ENVIRONMENT : "runs in"
  TURN ||--o{ TOOL_CALL : makes
```


## Pie

```mermaid
pie title Tokens by provider
  "Claude" : 52
  "Codex" : 31
  "Gemini" : 11
  "Other" : 6
```


## Mindmap

```mermaid
mindmap
  root((bb))
    Threads
      Turns
      Timeline
    Environments
      Worktree
      Checkout
    Plugins
      Renderers
      Commands
```


## Timeline

```mermaid
timeline
  title Renderer history
  2025 : Mermaid 11
  2026-01 : beautiful-mermaid 0.1
  2026-02 : beautiful-mermaid 1.1.3 (last release)
  2026-07 : agentic-mermaid 0.4
  2026-09 : zombie-mermaid 3.1
```


## User journey

```mermaid
journey
  title Adding a diagram in bb
  section Ask
    Describe the system: 5: User
    Agent writes Mermaid: 4: Agent
  section Render
    Plugin draws it: 5: Plugin
    Toggle source: 3: User
```


## Quadrant

```mermaid
quadrantChart
  title Renderer options
  x-axis Low effort --> High effort
  y-axis Plain --> Polished
  quadrant-1 Worth it
  quadrant-2 Ideal
  quadrant-3 Skip
  quadrant-4 Overbuilt
  bb stock: [0.2, 0.3]
  beautiful-mermaid: [0.4, 0.75]
  agentic-mermaid: [0.45, 0.85]
  Archify: [0.9, 0.9]
```


## XY chart

```mermaid
xychart-beta
  title "Diagram renders per day"
  x-axis [Mon, Tue, Wed, Thu, Fri]
  y-axis "Renders" 0 --> 50
  bar [12, 18, 25, 31, 44]
  line [12, 18, 25, 31, 44]
```


## Architecture

```mermaid
architecture-beta
  group bb(cloud)[bb app]
  service ui(internet)[Chat UI] in bb
  service plugin(server)[Plugin backend] in bb
  service disk(disk)[Renderer chunks] in bb
  ui:R --> L:plugin
  plugin:R --> L:disk
```


## Radar

```mermaid
radar-beta
  title Renderer comparison
  axis look["Looks"], types["Types"], theme["Theming"], speed["Speed"], upkeep["Maintained"]
  curve stock["bb stock"]{2, 5, 2, 3, 5}
  curve agentic["agentic-mermaid"]{5, 4, 5, 4, 4}
  max 5
```


## Git graph

```mermaid
gitGraph
  commit
  branch feature
  commit
  commit
  checkout main
  commit
  merge feature
  commit
```


## Sankey (unsupported → stock)

```mermaid
sankey-beta
A,B,10
A,C,5
```


## Broken syntax (→ stock error state)

```mermaid
flowchart LR
  A-->
```


## Front matter + init directive

```mermaid
---
title: Front matter
---
%%{init: {"theme":"dark"}}%%
flowchart TD
  A[Start] --> B{Ok?}
  B -->|yes| C[Done]
  B -->|no| A
```
