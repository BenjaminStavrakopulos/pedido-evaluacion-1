# Pedido Evaluación 1 — Microservicio Backend Monsite (Pagos y Notificaciones)

Repositorio creado para la **Evaluación Parcial 1** de la asignatura DevOps. Contiene el
microservicio backend (Node.js/Express) y el frontend estático del proyecto **Monsite**,
reutilizados como base para diseñar y ejecutar un flujo de trabajo Git/GitHub/GitHub Actions.

El microservicio principal evaluado es el backend ubicado en [`backend/`](backend/), que expone
una API REST para:
- Procesamiento de pagos (Mercado Pago y Transbank).
- Webhooks de confirmación de pago.
- Envío de notificaciones por email y WhatsApp.
- Autenticación y seguridad de rutas administrativas.

## Estrategia de ramificación: GitFlow

Se optó por **GitFlow completo** (en lugar de trunk-based development) por las siguientes razones:

- El proyecto integra pagos reales (Mercado Pago/Transbank), por lo que se requiere un control
  estricto de qué cambios llegan a producción (`main`) versus los que están en integración
  (`develop`). Un error en el flujo de pagos es costoso y difícil de revertir en producción.
- El equipo trabaja en parejas con features que pueden tardar más de un día en completarse
  (por ejemplo, integrar un nuevo medio de pago), lo que se adapta mejor a ramas `feature/*`
  de vida media que a commits directos sobre una única rama compartida.
- Se necesita una rama estable (`main`) que refleje siempre el último release funcionando,
  y una rama `develop` donde se integra y prueba el trabajo en curso antes de liberar.
- GitFlow define explícitamente ramas `hotfix/*` para corregir errores críticos en producción
  sin tener que esperar el próximo ciclo de `develop`, algo relevante en un sistema que procesa
  pagos en tiempo real.

### Ramas del repositorio

| Rama | Propósito |
|---|---|
| `main` | Código en producción. Solo recibe merges desde `develop` (release) o `hotfix/*`. Siempre debe estar desplegable. |
| `develop` | Rama de integración. Recibe merges desde `feature/*` una vez revisados. Base para el próximo release. |
| `release/<version>` | (Opcional) Rama de estabilización antes de pasar `develop` a `main`. |
| `feature/<nombre>` | Nueva funcionalidad. Se crea desde `develop` y se integra de vuelta a `develop` mediante Pull Request. |
| `hotfix/<nombre>` | Corrección urgente sobre producción. Se crea desde `main` y se integra a `main` **y** a `develop` mediante Pull Request. |

## Convención de nombres de ramas

- `feature/<descripcion-corta-en-kebab-case>` — ej: `feature/notificaciones-whatsapp`
- `hotfix/<descripcion-corta-en-kebab-case>` — ej: `hotfix/validacion-webhook-pago`
- `release/<version-semver>` — ej: `release/1.1.0`

## Convención de commits

Se utiliza el formato de **Conventional Commits**:

```
<tipo>(<alcance-opcional>): <descripción corta en modo imperativo>
```

Tipos permitidos:
- `feat`: nueva funcionalidad.
- `fix`: corrección de errores.
- `docs`: cambios de documentación.
- `refactor`: cambios de código que no agregan funcionalidad ni corrigen bugs.
- `test`: agregar o corregir pruebas.
- `chore`: tareas de mantenimiento (dependencias, configuración, CI).

Ejemplos:
```
feat(payment): agregar validación de monto mínimo en checkout
fix(webhook): corregir verificación de firma de Mercado Pago
docs(readme): documentar convenciones de ramas y commits
```

## Flujo de trabajo (Pull Requests)

1. Clonar el repositorio y entrar al proyecto:

```bash
git clone <URL_DEL_REPOSITORIO>
cd pedido-evaluacion-1
git switch develop
```

2. Actualizar la rama antes de comenzar y crear una rama de trabajo:

```bash
git pull origin develop
git switch -c feature/nombre-del-cambio
```

3. Realizar cambios, revisar el estado y crear un commit trazable:

```bash
git status
git add <archivos-modificados>
git commit -m "feat(scope): describir el cambio"
```

4. Publicar la rama y abrir un Pull Request hacia `develop`:

```bash
git push -u origin feature/nombre-del-cambio
```

5. El Pull Request debe describir el cambio, cómo probarlo y referenciar el issue/tarea si aplica.
  GitHub Actions ejecuta automáticamente la verificación de CI (ver
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) en cada push a `main` o `develop` y
  en Pull Requests hacia `main` o `develop`.
6. La revisión requiere al menos la aprobación de un/a integrante distinto/a del autor antes de
   hacer merge (revisión por pares).
7. Después de resolver observaciones y confirmar que CI está en verde, se integra el Pull Request.
  Se utiliza **squash merge** para features (mantener historial limpio en `develop`/`main`) y
   **merge commit** para hotfixes hacia `main` y `develop` (trazabilidad explícita del hotfix).
8. Una vez fusionada, actualizar las ramas locales y eliminar la rama de trabajo:

```bash
git switch develop
git pull origin develop
git branch -d feature/nombre-del-cambio
git push origin --delete feature/nombre-del-cambio
```

9. Cuando `develop` se promueve mediante Pull Request a `main`, el job `deploy` se ejecuta
  automáticamente después de CI y publica el frontend en Firebase Hosting.

## Flujo CI/CD automatizado

El workflow implementa un flujo DevOps básico y reproducible:

1. **Integración continua (CI):** instala Node.js 20 y las dependencias con `npm ci`, comprueba la
  sintaxis del backend, valida referencias HTML/JS y busca secretos críticos trackeados.
2. **Entrega continua (CD):** cuando un cambio llega a `main` y CI termina correctamente,
  `FirebaseExtended/action-hosting-deploy` publica el frontend configurado en `firebase.json`.
3. **Protección de credenciales:** la cuenta de servicio no se guarda en el repositorio. Debe
  registrarse en GitHub como secreto del repositorio con el nombre `FIREBASE_SERVICE_ACCOUNT`.

Para configurar el despliegue en GitHub:

1. Ir a `Settings > Secrets and variables > Actions`.
2. Crear el secreto `FIREBASE_SERVICE_ACCOUNT` con el JSON de una cuenta de servicio autorizada
  para Firebase Hosting.
3. Confirmar que el workflow se ejecute desde `main` y revisar el resultado en la pestaña
  `Actions`.

## Estrategia de revisión de código

- Ningún cambio se fusiona sin al menos una revisión aprobada.
- El revisor valida: legibilidad, cobertura de casos límite, ausencia de credenciales/secretos
  en el código y que la verificación de CI haya pasado.
- Los comentarios de revisión deben resolverse (o justificarse) antes del merge.

## Estructura del proyecto

```
backend/        Microservicio Node.js/Express (pagos, notificaciones, webhooks)
admin/          Panel administrativo (HTML/JS)
js/, css/       Frontend estático (catálogo, checkout, cuenta de usuario)
scripts/        Scripts de validación y escaneo de seguridad del proyecto
load-tests/     Pruebas de carga (Locust)
.github/workflows/ci.yml  Pipeline de integración continua (CI)
```

## Ejecución local del backend

```bash
cd backend
cp .env.example .env   # completar variables reales, nunca subir .env
npm install
npm start
```
