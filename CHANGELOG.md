# Changelog

## 1.0.0 — 2026-08-27

Primeira versão.

- Painel estilo Win+V em `Super+V`: perto do mouse, primeiro item selecionado, tema do shell.
- Texto (até 4 linhas + tamanho) e imagens (miniatura até 300×120).
- Enter/clique cola no app com foco (`Ctrl+V`, ou `Ctrl+Shift+V` em terminais);
  `Shift+Enter`/botão do meio só copia.
- Fixar, excluir, "Limpar tudo" (mantém fixados), filtro por digitação, atalhos de teclado.
- Dedupe (item repetido sobe para o topo), limite de 50 itens, 1 MB texto / 10 MB imagem,
  ignora gerenciadores de senha.
- Persistência em `~/.cache/winv` (debounced + atômica), opcional.
- Preferências libadwaita.
- Remove `<Super>v` de `toggle-message-tray` na ativação e restaura ao desativar
  (notificações continuam em `Super+M`).
- Empacotamento: `.deb`, zip (`gnome-extensions pack`), tarball, `install.sh`/`uninstall.sh`.
