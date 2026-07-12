# Servir /privacy-policy sur api.agridrone.fr (comme agrimodule)

Sur agrimodule, `https://api.agrimodule.fr/privacy-policy` est un **fichier HTML
statique** servi par **Apache** (Apache en frontal, qui proxy le reste vers
uvicorn/FastAPI). On reproduit le même montage pour agridrone.

## 1. Déposer le fichier sur le serveur

Copier `privacy-policy.html` dans un dossier servable par Apache, p. ex. :

```bash
scp server/privacy-policy.html user@SERVEUR:/var/www/agridrone/privacy-policy.html
```

Adapter le chemin à l'arborescence réelle (utiliser le même emplacement que la
page agrimodule si tu le connais).

## 2. Exclure le chemin du proxy uvicorn dans le vhost Apache

Dans le `<VirtualHost *:443>` de `api.agridrone.fr`, AVANT la directive
`ProxyPass / http://127.0.0.1:PORT/` qui envoie tout vers uvicorn, ajouter :

```apache
    # Politique de confidentialité servie en statique (hors proxy uvicorn)
    Alias /privacy-policy /var/www/agridrone/privacy-policy.html
    <Location /privacy-policy>
        ProxyPass !
        Require all granted
    </Location>
```

L'ordre compte : `ProxyPass !` doit être déclaré avant le `ProxyPass /` global,
sinon le chemin part vers uvicorn (→ 404).

## 3. Recharger Apache et vérifier

```bash
apachectl configtest && systemctl reload apache2
curl -I https://api.agridrone.fr/privacy-policy   # attendu : 200, Server: Apache, Content-Type: text/html
```

## 4. URL à renseigner dans App Store Connect

```
https://api.agridrone.fr/privacy-policy
```
