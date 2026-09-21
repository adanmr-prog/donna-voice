---
name: release
description: Release-workflow voor Donna OS - versienummer bepalen, CACHE in sw.js bumpen, versiecommentaar controleren, syntaxcheck, commit "vX.Y: ..." en push. Alleen handmatig starten.
disable-model-invocation: true
---

# Release Donna OS

Voer de stappen in volgorde uit. Stop bij een fout en meld wat er misging.

1. **Versie bepalen.** Zoek de hoogste `vX.Y` in `git log --oneline`. Bugfix of kleine wijziging: Y + 1. Nieuwe feature of gedragswijziging: X + 1 en Y = 0. Vraag bevestiging van het nummer voordat je verdergaat.
2. **Cache bumpen.** Zet in `sw.js`: `var CACHE = 'donna-os-v<X.Y>';` met hetzelfde nummer als de release. Zonder deze stap krijgen geïnstalleerde PWAs de nieuwe `index.html` niet.
3. **Versiecommentaar.** Controleer dat elke inhoudelijke wijziging in `index.html` een `// vX.Y: reden`-commentaar heeft, in de stijl van de bestaande code.
4. **Syntaxcheck.** Draai:
   ```bash
   echo '{"tool_input":{"file_path":"index.html"}}' | bash .claude/hooks/check-index.sh
   ```
   Exitcode 0 is vereist.
5. **Commit en push.** Alleen de gewijzigde app-bestanden. Titel: `vX.Y: <korte omschrijving in het Nederlands>`. Push naar de huidige branch met `git push -u origin <branch>`.
6. **Melden.** Vat samen: versie, cache-naam, gewijzigde bestanden. Vermeld dat gebruikers de PWA één keer volledig moeten sluiten en heropenen om de nieuwe service worker te activeren.

Nooit: force-pushen, `sw.js` overslaan, of de `API`-constante wijzigen zonder expliciete opdracht.
