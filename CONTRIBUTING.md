# Contribuindo com o Sup V

Obrigado pelo interesse! Este documento explica como reportar problemas, propor mudanças e
enviar código.

## Reportando um bug

Abra uma issue em https://github.com/felipersd8/SupV/issues com:

1. Versão do GNOME Shell (`gnome-shell --version`), distro e sessão (`echo $XDG_SESSION_TYPE`).
2. Versão do Sup V (`gnome-extensions info supv@felipersd8.github.io | grep Versão`).
3. O que você fez, o que esperava e o que aconteceu.
4. Logs do shell relacionados (procure por `[supv]`, `JS ERROR` ou `supv@felipersd8.github.io`):
   ```bash
   journalctl --user -o cat -u 'org.gnome.Shell@*.service' --since "-10min" | grep -iE "supv|JS ERROR"
   # em distros sem unit systemd para o shell:
   journalctl -o cat /usr/bin/gnome-shell --since "-10min" | grep -iE "supv|JS ERROR"
   ```
5. Se for problema de colar: em qual aplicativo, e se ele é um terminal.

## Propondo melhorias

Abra uma issue descrevendo o caso de uso. O objetivo do projeto é **replicar a experiência
do Win+V do Windows dentro do GNOME Shell** — funcionalidades que fujam disso (sincronização
em nuvem, snippets, etc.) tendem a ficar fora do escopo.

## Ambiente de desenvolvimento

```bash
git clone https://github.com/felipersd8/SupV.git && cd SupV
make check              # valida schema e sintaxe
make install            # instala em ~/.local/share/gnome-shell/extensions (sem root)
make test               # sessão headless + smoke test (não precisa de logout)
```

Leia [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md) (ferramentas, sessão headless, testes)
e [docs/ARQUITETURA.md](docs/ARQUITETURA.md) (como o código é organizado).

## Estilo de código

- JavaScript ESM (GNOME 45+), 4 espaços, aspas simples, ponto e vírgula. Segue o estilo do
  próprio GNOME Shell (`gjs` + GObject Introspection).
- Nada de `imports.gi` legado, nada de variáveis globais, nada de `setInterval`/polling.
- **Tudo que `enable()` cria, `disable()` destrói**: sinais, atores, timeouts
  (`GLib.source_remove`), keybindings, dispositivos virtuais. Extensões que vazam quebram ao
  bloquear a tela e são rejeitadas na revisão do GNOME.
- Mensagens de log prefixadas com `[supv]`; use `console.warn` para falhas recuperáveis.
- Textos visíveis ao usuário em português (pt-BR); comentários em português.
- Compatibilidade: GNOME 46–50. Se uma API mudou entre versões, trate as duas gerações
  (veja os exemplos em `panel.js` e `paster.js`) e documente em `docs/ARQUITETURA.md`.

## Pull requests

1. Crie uma branch a partir de `main`.
2. Commits pequenos, mensagens no formato `tipo: descrição` (`feat`, `fix`, `docs`, `chore`,
   `refactor`, `test`). Sem rodapés `Co-Authored-By`.
3. Antes de abrir o PR:
   - `make check` passa;
   - `make test` passa (ou explique por que um caso não se aplica);
   - testou na sessão real (logout/login) pelo menos: abrir, colar, fixar, desativar;
   - ativar/desativar várias vezes não gera erros no journal.
4. Descreva o que muda e por quê; anexe screenshot se mexer no visual.

## Lançando uma versão

1. Atualize `version-name` em `src/metadata.json`, `CHANGELOG.md` e `debian/changelog`.
2. `make clean all` gera `dist/` (zip, tarball, .deb) — confira `dpkg-deb --info`.
3. Commit `chore: versão X.Y.Z`, tag `vX.Y.Z`, push da tag.
4. O workflow de CI cria a release no GitHub e anexa os artefatos.
