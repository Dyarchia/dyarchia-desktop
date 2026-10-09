# Kamini

Every definition an agent CLI reads, made once and exported to each CLI that reads it.

## Three faces

- **Workbench** holds what is being made, in `~/.dyarchia/kamini`: agents, skills, commands, prompts,
  memory files, rules and plugins. Done moves one to the **Library**, Reopen brings it back. Nothing
  reaches a CLI until Export.
- **Installed** lists what each CLI already has, in the home folder and in one project, in a folder
  per CLI; what a plugin brings sits inside that plugin, newest version only. Copy brings
  a definition here as `<name>-copy`, a plugin with its members, so exporting it never writes over
  the original.
- A new definition is a draft until its first change. What is open closes with its X or Escape.
- The owl key opens help for the tab on screen: every field, who reads it, its default and the
  page that documents it.

## What each CLI receives

```text
CLI          Agents  Skills  Commands          Prompts                 Memory     Rules          Plugin manifest
-----------  ------  ------  ----------------  ----------------------  ---------  -------------  --------------------------
Claude Code  md      yes     .claude/commands  output-styles           CLAUDE.md  .claude/rules  .claude-plugin/plugin.json
Codex        toml    yes     ~/.codex/prompts  -                       AGENTS.md  -              plugin.json
Antigravity  md      yes     -                 -                       AGENTS.md  .agents/rules  plugin.json
Vibe         toml    yes     -                 .vibe/prompts           AGENTS.md  -              plugin.json
Kimi         md      yes     plugin only       ~/.kimi-code/SYSTEM.md  AGENTS.md  -              kimi.plugin.json
Grok         md      yes     .grok/commands    .grok/personas          AGENTS.md  .grok/rules    plugin.json
```

- Paths, formats and what an agent file can carry (tools, effort, skills, MCP, hooks) are in
  `src/targets.ts`. What a CLI cannot carry is listed in Output as dropped, never written globally.
- Codex runs a custom agent only as a subagent; as the main agent Export also writes a profile,
  `~/.codex/<name>.config.toml`. A Vibe agent is either selectable or spawned; Main wins.
- CLIs that read one folder or file get one copy carrying the fields any of them reads:
  `.agents/skills` for Codex, Vibe, Kimi and Grok; a project's `AGENTS.md` for five of them.
- A plugin is written into its folder as `<cli>/<name>/`, one tree per CLI in that CLI's layout.

## What Export never does

- Overwrite a file it did not write, or one changed since: the path is reported and Replace is the
  person's. `exports.json` holds the hash of every file written.
- Delete anything. Deleting a definition leaves its exported files where they are.

## The catalogue

- `src/catalogue/<cli>.json` lists every agent, skill, hook, MCP, command, prompt, rule and plugin
  field of each CLI with a one-line note and the page that states it, read from its documentation
  and from its source where the documentation is silent. A field missing there is a field the form
  cannot offer: add it there.
