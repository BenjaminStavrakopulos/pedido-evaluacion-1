# Monsite: evaluacion 2 de Ingenieria DevOps

Backend Node.js/Express reutilizado de la evaluacion anterior. Esta copia es un
laboratorio independiente: **no despliega ni se conecta al Firebase, Hosting o
Cloud Run de Monsite**. La rama de trabajo es `main`.

La copia local de evaluacion se encuentra en `C:\Dev\evaluacion-2-monsite`,
fuera de OneDrive. Su remoto es
`https://github.com/BenjaminStavrakopulos/pedido-evaluacion-1`.
El backend es una carpeta propia: no hay enlaces, montajes ni dependencias
locales hacia el proyecto original. Compartir el origen del codigo no implica
compartir el servidor o los datos en ejecucion.

## Limites del entorno

- Proyecto ficticio fijo: `demo-monsite-evaluacion`.
- Firestore y Authentication se ejecutan en Firebase Emulator.
- No se leen archivos `.env`, cuentas de servicio ni credenciales del equipo.
- El servidor rechaza proyectos reales, emuladores remotos y credenciales de
  Firebase, pagos, correo o Twilio.
- Las rutas originales de Mercado Pago, Transbank, notificaciones y webhooks
  responden **503**. Sus implementaciones y SDKs externos se retiraron de esta
  copia: no hay clientes de pago, SMTP ni Twilio instalados.
- La API `/api/evaluation` confirma pagos ficticios utilizando la logica
  compartida de pedidos e inventario. Siempre indica `simulated: true` y
  `charged: false`. Email/WhatsApp se guardan en `evaluation-outbox` con
  `delivered: false`; no se envian.
- Se retiraron el frontend, su configuracion Firebase, las reglas cloud y
  los scripts administrativos del entorno real. Se conserva el historial
  Git de la evaluacion anterior, pero no se ejecuta su configuracion.
- Se deshabilita la deteccion automatica de metadatos GCP: no se utiliza
  la identidad cloud del equipo o del runner.
- Compose no monta carpetas personales ni publica puertos del emulador.
  Solo expone el backend en un puerto dinamico de `127.0.0.1`. La red interna
  bloquea egreso hacia Internet durante la ejecucion de los contenedores.
- Los datos son efimeros: no hay volumen persistente ni importaciones reales.
  No introducir datos personales, tarjetas ni pedidos de clientes.

La instalacion de dependencias y construccion de imagenes necesita Internet;
el aislamiento de red se aplica al entorno Compose en ejecucion.

## Inicio con Docker Compose

Requisitos: Git y Docker Desktop con contenedores Linux y Compose v2.
Ejecutar desde la raiz de **este repositorio**, no desde Monsite.

```powershell
Set-Location C:\Dev\evaluacion-2-monsite
git switch main
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
docker compose port backend 3000
```

El ultimo comando muestra una direccion como `127.0.0.1:32768`.
Para consultar el backend desde PowerShell:

```powershell
$address = docker compose port backend 3000
Invoke-RestMethod "http://$address/health"
Invoke-RestMethod "http://$address/ready"
```

`/health` informa revision, entorno y simulacion. `/ready` responde 200 solo
cuando puede consultar Firestore **y** Auth del emulador; devuelve 503 si no
estan disponibles.

### Pruebas de integracion y escalado

```powershell
docker compose --profile test build integration
docker compose --profile test run --rm integration
docker compose up -d --no-build --wait --scale backend=2
docker compose port --index 1 backend 3000
docker compose port --index 2 backend 3000
```

Cada replica recibe un puerto de loopback diferente. No se usa `container_name`
ni un puerto fijo que impida escalar. No se incluye un balanceador: en CI se
comprueba cada replica individualmente; Compose no implementa autoescalado.
Firestore Emulator es una dependencia unica de laboratorio, no un servicio
distribuido de produccion.

```powershell
docker compose logs --tail 100
docker compose --profile test down --volumes --remove-orphans
```

No ejecutar comandos de despliegue Firebase o `gcloud` para esta evaluacion.
No es necesario copiar ni crear un archivo `.env`.

## Contenedores

| Servicio | Funcion | Restricciones |
| --- | --- | --- |
| backend | API existente adaptada al laboratorio | Node 24 slim, construccion multietapa, dependencias de runtime, usuario no root, filesystem de solo lectura, 384 MiB, 0.5 CPU |
| firebase | Firestore y Auth emulados | Node 24 slim + Java 21, usuario no root, 1536 MiB, 1 CPU, sin puertos publicados |
| integration | Pruebas contra backend y emuladores | Perfil `test`, imagen derivada del mismo runtime, efimero, 384 MiB, 0.5 CPU |

Las imagenes excluyen credenciales y `node_modules` locales. El backend tiene
healthcheck de readiness, arranque condicionado a Firebase saludable,
limites de procesos, eliminacion de capabilities y parada ordenada.
Los reinicios usan `unless-stopped`; un healthcheck por si solo no reinicia
un proceso que continua vivo pero esta unhealthy.

## Pruebas y politica de calidad

Con Node.js 24:

```powershell
npm ci
npm ci --prefix backend
npm run test:config
npm run test:coverage
npm run validate
npm run security:scan
npm audit --prefix backend --omit=dev --audit-level=high
```

Cobertura y resultados:

- Pruebas unitarias: validacion de aislamiento, rechazo de credenciales reales,
  comparacion de tokens, CORS, JSON invalido, rate limiting, health/readiness,
  bloqueo de integraciones reales y notificaciones ficticias.
- Logica reutilizada de pagos: firmas de carrito, descuento de multiples
  productos, lecturas antes de escrituras en transacciones Firestore,
  idempotencia y propagacion de fallos.
- Integracion Compose: identidad creada/verificada en Auth Emulator, pedidos
  en Firestore, pagos concurrentes sin doble descuento y outbox sin envios.
- Pruebas de configuracion: red interna, loopback, ausencia de montajes y
  credenciales, Dependabot y dependencias bloqueantes entre jobs.
- La salida de cobertura es descriptiva, no se afirma cobertura total ni se
  inventa un porcentaje exigido por la pauta.
- Cualquier prueba fallida bloquea la construccion y el despliegue. No hay
  `continue-on-error` en los controles de calidad o seguridad.
- El escaneo de secretos heredado es un control basico por patrones y archivos
  versionados, no sustituye un detector completo de secretos.

Alternativa para ejecutar integracion sin Docker, con Java 21 instalado:

```powershell
npm ci --prefix emulator
npm run test:emulator
```

Este comando inicia emuladores locales temporales y usa la misma suite de
integracion. **No verifica las imagenes ni la red de Compose**. Usarlo solo
sin otra instancia del emulador en los puertos 8080/9099.

## Pipeline GitHub Actions

Archivo: [ci.yml](.github/workflows/ci.yml).
Se ejecuta en pushes y pull requests a `main`/`develop`, y manualmente.
Cada ejecucion usa un proyecto Compose propio:

```text
Pruebas y calidad --> Construccion + integracion Docker --+
                                                        +--> Despliegue simulado --> Limpieza
Snyk dependencias/codigo --------------------------------+
```

1. **quality** instala desde lockfiles, ejecuta pruebas, publica JUnit y
   valida estructura, secretos y dependencias de runtime con `npm audit`.
2. **security** ejecuta `snyk test` para dependencias de runtime y
   `snyk code test` para analisis estatico del backend. Severidad **high o
   critical**, errores del analizador, autenticacion fallida o token ausente
   bloquean el job. Los reportes JSON/SARIF disponibles se conservan como
   artefactos; no se publican automaticamente en la pestana Security.
3. **build** depende de calidad. Construye backend, emulador e integracion,
   levanta un laboratorio temporal y ejecuta las pruebas sobre las imagenes.
   Las etiqueta con el SHA completo del commit y genera un archivo de
   imagenes con checksum SHA-256. Siempre elimina su laboratorio al terminar.
   Puede validar Docker aunque Snyk este pendiente: esto no aprueba la
   seguridad ni habilita el despliegue.
4. **deploy** exige **build y security exitosos**. Descarga y verifica el
   artefacto y despliega **esas mismas
   imagenes**, sin reconstruir, en el runner Linux temporal. Levanta dos
   replicas, comprueba salud/revision de ambas, ejecuta integracion y verifica
   el bloqueo del egreso externo.
5. Siempre recopila logs/estado disponibles y ejecuta `down` para eliminar
   solo el entorno de esa ejecucion.

El despliegue simulado se realiza tambien para PRs: no publica servicios en
Internet y no requiere credenciales de cloud. No es un hosting persistente.
La simulacion termina cuando acaba el job y no genera una URL permanente.

### Configuracion requerida en GitHub

1. Habilitar GitHub Actions en el repositorio.
2. Crear una cuenta/organizacion Snyk y habilitar **Snyk Code**.
3. Guardar `SNYK_TOKEN` en Settings > Secrets and variables > Actions.
   No pegar el token en codigo, README ni mensajes de chat.
4. Habilitar Dependabot alerts y security updates en Settings > Code security.
   [dependabot.yml](.github/dependabot.yml) programa revisiones semanales para
   npm, GitHub Actions e imagenes Docker. Dependabot no es un job de Actions.
5. Ejecutar el workflow y revisar reportes y resumen. Sin `SNYK_TOKEN` el
   pipeline falla intencionalmente; **no se considera un pipeline verificado**.
6. Opcionalmente, configurar proteccion de `main` exigiendo los checks de
   pruebas, Snyk y despliegue simulado antes de aceptar merges.
   El YAML no crea reglas de proteccion de ramas.

Los PRs de forks no reciben secretos de Actions y fallan el control de Snyk
por diseno. Para analizar PRs creados por Dependabot se debe configurar
tambien `SNYK_TOKEN` como secreto de Dependabot; no se omite el analisis para
aprobar actualizaciones automaticamente.

El antiguo secreto `FIREBASE_SERVICE_ACCOUNT`, si existe, **no se referencia
ni se usa**. No se modifica ni se elimina: podria pertenecer al proyecto real.
El workflow anterior de Hosting fue reemplazado por este despliegue aislado.

### Trazabilidad

- Commit SHA -> etiquetas de las tres imagenes -> artefacto con checksum ->
  imagenes cargadas en despliegue -> revision verificada por HTTP.
- `APP_REVISION` identifica el commit servido por cada replica en `/health`.
- La etiqueta OCI `org.opencontainers.image.revision` se incorpora al
  construir y se verifica al cargar la imagen, antes de levantar Compose.
- JUnit y reportes de seguridad se vinculan al SHA y a la ejecucion de Actions.
- Imagenes: retencion de 3 dias. Evidencias, logs y reportes: 14 dias.
- El resumen del job registra commit, enlace a ejecucion, imagenes, replicas
  y proyecto Compose. El historial Git/Actions registra autores y resultados.

### Seguridad: alcance y limites

El bloqueo automatico controla dependencias **de runtime del backend** y
codigo con umbral high/critical. Las dependencias de herramientas y
alertas moderadas tambien deben revisarse; no se
afirma que todo el repositorio este libre de vulnerabilidades.
En la validacion local del 15 de octubre de 2026, `npm audit` del backend
reporto **0 vulnerabilidades** tras retirar los SDKs externos y actualizar
Firebase Admin a su API modular, comprobada con pruebas de integracion.
Este resultado solo corresponde a las dependencias del backend en esa fecha,
no constituye un analisis completo de seguridad ni garantiza resultados Snyk.
El conteo puede cambiar con la base de avisos de npm.
Dependabot incluye las herramientas de raiz y del emulador.
Los escaneos Snyk requieren conectividad y pueden requerir habilitacion o
cuota del servicio. Un error no se convierte en aprobacion.

## Relacion con la pauta

| Indicador | Implementacion | Evidencia esperada |
| --- | --- | --- |
| IE1 | Dockerfiles y construccion multietapa backend | job build e imagen etiquetada |
| IE2 | Unitarias + integracion emulada | JUnit, cobertura y salida de integracion |
| IE3 | Dependabot, Snyk, bloqueo, recursos y aislamiento | reportes, checks y configuracion |
| IE4 | Despliegue automatico temporal y SHA verificado | resumen y artefactos deployment |
| IE5 | Compose, healthchecks y dos replicas | estado de contenedores y pruebas |

Los archivos de configuracion no demuestran por si solos un despliegue exitoso:
el equipo debe conservar una ejecucion verde de Actions y revisar su evidencia.

## Uso de IA y tareas del equipo

Esta adaptacion utilizo **un asistente de IA mediante Copilot SDK en VS Code**
el 15 de octubre de 2026 como apoyo para generar configuracion, codigo,
pruebas y documentacion operativa. Esta declaracion describe el alcance real
del apoyo; no equivale a validacion o autoria tecnica del equipo.

La pauta limita los usos permitidos de IA. El equipo debe confirmar con el
docente si el apoyo en codigo/configuracion es admisible, revisar y validar
cada cambio y citar la herramienta segun las instrucciones institucionales:
[Guia de IA Duoc UC](https://bibliotecas.duoc.cl/ia).
No se presentan conclusiones, justificaciones tecnicas ni reflexiones
individuales generadas para la evaluacion 2.

Pendiente de los integrantes, sin apoyo de IA:

- Analisis y justificaciones tecnicas propias.
- Conclusiones y reflexion individual sobre aprendizaje y contribucion.
- Revision del alcance permitido del uso de IA y su declaracion final.
- Entrega del enlace al AVA y envio por correo al docente.

La documentacion previa se conserva sin reescribir sus conclusiones o
reflexiones en [evaluacion-1.md](docs/evaluacion-1.md), solo como archivo
historico. Sus comandos de Firebase **no corresponden a este laboratorio**.

## Referencias operativas

- [Docker Compose](https://docs.docker.com/compose/)
- [Redes internas de Docker](https://docs.docker.com/reference/compose-file/networks/#internal)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Dependabot](https://docs.github.com/en/code-security/dependabot)
- [Snyk CLI](https://docs.snyk.io/developer-tools/snyk-cli)
- [Firebase Local Emulator Suite y proyectos demo](https://firebase.google.com/docs/emulator-suite/connect_and_prototype)
