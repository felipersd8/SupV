# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## 1.0.0 — 2026-08-27

Primeira versão pública. (O projeto nasceu como "WinV" e foi renomeado para **Sup V**
antes do lançamento; o UUID é `supv@felipersd8.github.io`.)

### Adicionado
- Painel estilo Win+V em `Super+V`: abre perto do mouse, primeiro item selecionado, segue o
  tema claro/escuro do shell.
- Itens de texto (prévia de até 4 linhas + tamanho) e imagens (miniatura até 300×120,
  dimensões e tamanho).
- `Enter`/clique cola no app com foco (`Ctrl+V`, ou `Ctrl+Shift+V` em terminais);
  `Shift+Enter`/botão do meio só copia. Foco permanece no campo original.
- Fixar (`Ctrl+P`), excluir (`Delete`), "Limpar tudo" preservando fixados
  (`Ctrl+Shift+Delete`), filtro por digitação, navegação por teclado.
- Dedupe por hash (item repetido sobe), limite de itens configurável, limites de 1 MB por
  texto e 10 MB por imagem, ignora gerenciadores de senha e seleção PRIMARY.
- Persistência opcional em `~/.cache/supv` (debounced, escrita atômica).
- Preferências libadwaita com logo, atalho configurável e limpeza do histórico.
- Remove `<Super>v` de `toggle-message-tray` na ativação e restaura ao desativar
  (notificações continuam em `Super+M`).
- Empacotamento: `.deb` (dpkg-deb), zip (`gnome-extensions pack`), tarball,
  `install.sh`/`uninstall.sh`, CI que publica releases a partir de tags.
- Ferramentas de desenvolvimento: sessão headless do GNOME Shell, `eval`, screenshot,
  teclado virtual e smoke test automatizado.
