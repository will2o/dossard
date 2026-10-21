# dossard-equipe

Socle d'équipe pour le projet Dossard, sous forme de plugin Claude Code.

## Contenu

- **Skill `api-conventions`** : conventions des routes HTTP (format d'erreur, nommage, forme des réponses, documentation).
- **Hooks** (`hooks/hooks.json`) :
  - `garde.py` (PreToolUse, Bash/PowerShell) : bloque les commandes interdites ;
  - `formate.py` (PostToolUse) : lint et formatage après modification ;
  - `journal_mcp.py` (PreToolUse, outils MCP) : journalise les appels MCP.
- **Serveur MCP `dossard`** (`.mcp.json`) : lecture seule des vues publiques, lancé depuis `${CLAUDE_PROJECT_DIR}/scripts/mcp_dossard.py`.

## Utilisation

Le plugin suppose un projet contenant `scripts/mcp_dossard.py`. Usage interne, sans licence de diffusion.
