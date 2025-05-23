# Hullámtér Szimulátor 1.1

Egy interaktív 3D hullámtér szimuláció, amelyet a Three.js könyvtár segítségével készítettem. A program lehetővé teszi egy forráspont gömbszerűen kibocsájtott hullámai terjedésének a megfigyelését a forráspont különböző típusú mozgásai közben a 3D térben.

## Főbb jellemzők

- **Különböző mozgástípusok**:
  - Vízelem (nincsen mozgás)
  - Tűzelem (vízszintes mozgás)
  - Körmozgás (körkörös mozgás)
  - Spirális mozgás (körkörös + emelkedő mozgás)

- **Testreszabható paraméterek**:
  - Forrás sebessége
  - Gömbök átlátszósága
  - Kameranézet

- **Felhasználóbarát kezelőfelület**
  - Élő vezérlőelemek
  - Részletes útmutató
  - Reszponzív design

## Telepítés és futtatás

1. Klónozd le a repository-t:
   ```
   git clone https://github.com/felhasznaloneved/hullamter-szimulator.git
   ```

2. Nyisd meg a `sphere_emitter_3d.html` fájlt egy modern webböngészőben (Chrome, Firefox, Edge ajánlott).

## Használat

1. A bal felső sarokban található vezérlőpanelen állíthatod be a kívánt paramétereket.
2. Válaszd ki a kívánt mozgástípust a legördülő menüből.
3. Az egérrel forgathatod a nézetet, a görgővel közelíthetsz vagy távolíthatsz.
4. A szükséges további információkért kattints az "Útmutató" gombra.

## Követelmények

- Modern webböngésző (HTML5 és WebGL támogatással)
- Internetkapcsolat (a Three.js betöltéséhez)

## Licenc

Ez a projekt nyílt forráskódú, a [MIT licenc](LICENSE) alatt érhető el.

## Fejlesztői információk

- **Verzió**: 1.1
- **Utolsó frissítés**: 2025. május 23.

---

Köszönöm, hogy a Hullámtér Szimulátort használod! Ha bármilyen kérdésed vagy javaslatod van, ne habozz megnyitni egy új issue-t a GitHub-on.
