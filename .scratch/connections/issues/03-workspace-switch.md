# The agent's gateway token keeps its workspace

Status: open

A gateway token carries the workspace that was active when the user authorized the agent. After a workspace switch the agent still sees the old workspace's connections until it signs in again. Fix by passing the active workspace through the eve channel auth and keying the agent's token store by user and workspace.
