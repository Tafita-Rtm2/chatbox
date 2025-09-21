# Analyse Complète et Guide de Modification

Ce document contient une analyse détaillée du fonctionnement de l'application Chatbox et un guide pour modifier le code afin de désactiver les délais d'attente (timeouts).

---

### **Partie 1 : Analyse du fonctionnement de l'application**

#### **1. Comment fonctionnent les "tokens illimités" ?**
Ce n'est pas une question de "tokens illimités" au sens propre, mais d'une technique appelée **streaming**. Pour créer un serveur compatible, il doit pouvoir envoyer sa réponse non pas en un seul bloc, mais en flux continu (techniquement, via des Server-Sent Events ou SSE).
*   **Principe** : Le serveur envoie la réponse morceau par morceau, presque mot par mot.
*   **Dans le code** : L'application reçoit ce flux et affiche les morceaux à l'écran au fur et à mesure, donnant l'impression que l'IA écrit en temps réel. La fonction `onResultChange` dans le fichier `src/renderer/packages/model-calls/stream-text.ts` est au cœur de ce système.

#### **2. Comment l'application lit-elle les fichiers ?**
L'application utilise une méthode avancée appelée **RAG (Retrieval-Augmented Generation)** pour "comprendre" le contenu des fichiers.
*   **Étape 1 : Analyse (Parsing)** : Elle extrait le texte brut de vos fichiers (Word, PDF, etc.) avec des outils comme `officeparser`. Pour les images, elle utilise une IA pour reconnaître le texte (OCR). Le code se trouve dans `src/main/file-parser.ts`.
*   **Étape 2 : Découpage et Vectorisation** : Le texte est découpé en petits morceaux, puis chaque morceau est transformé en un vecteur numérique (une série de chiffres) qui représente son sens sémantique.
*   **Étape 3 : Stockage & Recherche** : Ces vecteurs sont stockés. Quand vous posez une question, l'application compare le vecteur de votre question à ceux des morceaux de texte pour trouver les informations les plus pertinentes dans vos documents. Le code principal pour cela est dans `src/main/knowledge-base/file-loaders.ts`.

#### **3. Comment les réponses peuvent-elles être des fichiers ?**
Il s'agit de la fonctionnalité **"Artifact"**. La réponse n'est pas un vrai fichier, mais du code qui est exécuté.
*   **Principe** : Si vous demandez à l'IA de créer quelque chose de visuel (par exemple, "crée-moi un formulaire de contact"), elle va générer du code HTML, CSS et JavaScript.
*   **Dans le code** : L'application détecte ces blocs de code et les affiche dans une mini-fenêtre de navigateur (une `<iframe>`) directement dans le chat. Vous voyez donc le résultat visuel du code, pas le fichier lui-même. Le code pour cela est dans `src/renderer/components/Artifact.tsx`.

#### **4. Qu'en est-il des messages vocaux ?**
*   **Conclusion** : Après une analyse approfondie, **l'application n'a PAS de fonctionnalité intégrée pour la saisie vocale (voix-vers-texte)**.
*   **Explication** : Le code ne contient aucune logique pour accéder au microphone ou pour transcrire de l'audio. Cependant, il est *conçu* pour pouvoir utiliser un service externe pour le faire (via le système MCP), mais cette fonction n'est pas activée ou codée.

---

### **Partie 2 : Guide pour modifier `server.js` et désactiver les timeouts**

Voici la liste des instructions pour modifier le code vous-même et supprimer les délais d'attente.

**IMPORTANT : AVERTISSEMENT**
La suppression des délais d'attente peut rendre l'application instable. Une opération qui ne se termine jamais pourrait bloquer une partie de l'application indéfiniment. Effectuez ces changements avec prudence. Il est recommandé de faire une sauvegarde des fichiers avant de les modifier.

#### **1. Timeout du Serveur Proxy (`haji-api-server`)**
*   **Fichier à modifier :** `haji-api-server/server.js`
*   **Objectif :** Supprimer la limite de 30 secondes sur les appels à l'API externe.
*   **Instruction :** Trouvez la section de code ci-dessous et commentez la ligne `timeout: 30000`.

```javascript
// TROUVEZ CECI :
    const response = await axios.get(HAJI_API_URL, {
      params: { ... },
      timeout: 30000 // Increased timeout to 30 seconds
    });

// REMPLACEZ PAR CELA :
    const response = await axios.get(HAJI_API_URL, {
      params: { ... },
      // timeout: 30000 // Désactivé pour supprimer la limite de temps
    });
```

#### **2. Timeout du Traitement des Fichiers**
*   **Fichier à modifier :** `src/main/knowledge-base/db.ts`
*   **Objectif :** Empêcher que le traitement d'un gros fichier soit annulé après 5 minutes.
*   **Instruction :** Trouvez la constante `timeoutMinutes` et changez sa valeur de `5` à un nombre très grand.

```typescript
// TROUVEZ CECI :
    const timeoutMinutes = 5

// REMPLACEZ PAR CELA :
    const timeoutMinutes = 999999 // Valeur augmentée pour désactiver efficacement le timeout
```

#### **3. Timeout sur les Requêtes de l'API Chatbox**
*   **Fichier à modifier :** `src/shared/request/chatboxai_pool.ts`
*   **Objectif :** Désactiver un court timeout de 2 secondes.
*   **Instruction :** Trouvez la ligne `setTimeout` et commentez-la.

```typescript
// TROUVEZ CECI :
          const controller = new AbortController()
          setTimeout(() => controller.abort(), 2000) // 2秒超时
          const res = await ofetch(...)

// REMPLACEZ PAR CELA :
          const controller = new AbortController()
          // setTimeout(() => controller.abort(), 2000) // Timeout de 2s désactivé
          const res = await ofetch(...)
```

#### **4. Timeout sur les Outils Externes (MCP)**
*   **Fichier à modifier :** `src/main/mcp/shell-env.js`
*   **Objectif :** Neutraliser la fonction qui gère les timeouts pour les programmes externes.
*   **Instruction :** Remplacez le contenu entier de la fonction `setupTimeout`.

```javascript
// TROUVEZ CECI :
  var setupTimeout = (spawned, { timeout, killSignal = "SIGTERM" }, spawnedPromise) => {
    if (timeout === 0 || timeout === undefined) {
      return spawnedPromise;
    }
    let timeoutId;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timeoutKill(spawned, killSignal, reject);
      }, timeout);
    });
    const safeSpawnedPromise = spawnedPromise.finally(() => {
      clearTimeout(timeoutId);
    });
    return Promise.race([timeoutPromise, safeSpawnedPromise]);
  };

// REMPLACEZ PAR CELA :
  var setupTimeout = (spawned, { timeout, killSignal = "SIGTERM" }, spawnedPromise) => {
    // Fonction modifiée pour ignorer et désactiver tous les timeouts sur les processus externes.
    return spawnedPromise;
  };
```
