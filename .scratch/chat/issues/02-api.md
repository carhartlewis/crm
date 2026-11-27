# Chats, spaces and sidebar endpoints

Status: open
Blocked by: 01

The `chats` HttpApi group: prewarm, create, update, delete, history; spaces create, update, delete; `PUT /api/sidebar`. Every write returns a txid. Permission rules are in the spec. Behaviour tests with in-memory stores and `createMemoryKv`.
