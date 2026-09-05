Evaluación 1 – Microservicio Backend Monsite

1. Introducción

Para esta evaluación se utilizó como base el proyecto Monsite, específicamente su backend desarrollado con Node.js y Express, junto con parte del frontend estático.

El objetivo principal fue aplicar conceptos vistos en la asignatura de DevOps, principalmente relacionados con el uso de Git y GitHub, manejo de ramas, Pull Requests, revisión de código y automatización mediante GitHub Actions.

El backend de Monsite se encarga principalmente de funciones relacionadas con pagos y notificaciones, incluyendo integración con Mercado Pago y Transbank, recepción de webhooks, envío de correos y mensajes de WhatsApp, además de la protección de algunas rutas administrativas.

2. Estrategia de ramificación

Para el proyecto se decidió utilizar GitFlow, ya que permite separar de forma clara el código estable del código que todavía se encuentra en desarrollo.

La rama main representa la versión estable del proyecto, mientras que develop se utiliza para integrar los cambios realizados durante el desarrollo.

Para trabajar nuevas funcionalidades se utilizan ramas feature/. Por ejemplo:

feature/notificaciones-whatsapp

En caso de existir un problema urgente en producción, se pueden utilizar ramas hotfix/, creadas directamente desde main.

También se considera el uso opcional de ramas release/ cuando sea necesario preparar una versión antes de integrarla definitivamente a producción.

Esta estrategia resulta adecuada para el proyecto debido a que el backend incluye funciones importantes como el procesamiento de pagos. Mantener una separación entre desarrollo y producción disminuye el riesgo de incorporar cambios que todavía no han sido revisados o probados.

3. Convención de ramas y commits

Para mantener un repositorio más ordenado se definieron nombres simples para las ramas.

Las funcionalidades utilizan:

feature/nombre-del-cambio

Las correcciones urgentes:

hotfix/nombre-del-cambio

Y las versiones:

release/version

Además, para los commits se utiliza Conventional Commits, permitiendo identificar rápidamente qué tipo de modificación se realizó.

Algunos ejemplos son:

feat(payment): agregar validación de monto mínimo

fix(webhook): corregir validación de pago

docs(readme): actualizar documentación del proyecto

Los tipos utilizados principalmente son feat, fix, docs, refactor, test y chore.

Esto ayuda a mantener un historial más claro y facilita entender los cambios realizados sin tener que revisar directamente el código.

4. Flujo de trabajo con Git y GitHub

El trabajo comienza desde la rama develop.

Primero se actualiza la rama local:

git switch develop

git pull origin develop

Luego se crea una rama nueva para realizar el cambio:

git switch -c feature/nombre-del-cambio

Después de desarrollar la funcionalidad se revisan los archivos modificados y se genera el commit:

git status

git add .

git commit -m "feat(scope): descripción del cambio"

Finalmente, la rama se publica en GitHub:

git push -u origin feature/nombre-del-cambio

Una vez publicada, se crea un Pull Request hacia develop.

Antes de realizar el merge, otro integrante del equipo debe revisar el código. Además, las validaciones configuradas mediante GitHub Actions deben terminar correctamente.

Para las ramas de funcionalidades se utiliza preferentemente Squash Merge, evitando llenar el historial de develop con muchos commits pequeños.

5. Revisión de código

La revisión mediante Pull Requests permite que un integrante diferente al autor pueda comprobar el cambio antes de integrarlo.

Durante la revisión se consideran principalmente los siguientes aspectos:

* Que el código sea entendible y mantenga la estructura del proyecto.
* Que no existan credenciales o secretos escritos directamente en el código.
* Que se consideren posibles errores o casos límite.
* Que las validaciones automáticas de GitHub Actions hayan finalizado correctamente.

Si existen observaciones, estas deben ser corregidas o justificadas antes de realizar el merge.

Este proceso permite disminuir errores y mantener mayor control sobre los cambios que llegan a las ramas principales.

6. Integración y despliegue continuo

El repositorio cuenta con un workflow de GitHub Actions ubicado en:

.github/workflows/ci.yml

Este workflow se ejecuta cuando existen cambios o Pull Requests relacionados con las ramas main y develop.

En la etapa de Integración Continua, CI, se utiliza Node.js 20 y se realizan distintas verificaciones sobre el proyecto.

Entre ellas se encuentran:

* Instalación de dependencias mediante npm ci.
* Comprobación de sintaxis del backend.
* Validación de referencias utilizadas en HTML y JavaScript.
* Revisión para evitar que secretos importantes sean almacenados accidentalmente en el repositorio.

Cuando los cambios llegan correctamente a main, se ejecuta además la etapa de despliegue.

El frontend se publica automáticamente utilizando Firebase Hosting.

De esta manera, un cambio solamente puede llegar al despliegue si las verificaciones anteriores finalizan correctamente.

7. Manejo de credenciales

Debido a que el proyecto trabaja con servicios externos como Firebase y plataformas de pago, existen credenciales que no deben almacenarse directamente en GitHub.

Los archivos locales como .env se encuentran excluidos del repositorio y se utiliza un archivo .env.example solamente como referencia de las variables necesarias.

Para realizar el despliegue automático en Firebase se utiliza un GitHub Secret llamado:

FIREBASE_SERVICE_ACCOUNT

Este secreto contiene las credenciales necesarias para permitir que GitHub Actions realice el despliegue, sin necesidad de almacenar esas credenciales directamente dentro del código.

8. Estructura utilizada

El proyecto mantiene separadas las principales responsabilidades mediante distintas carpetas.

backend/        Backend Node.js/Express

admin/          Panel administrativo

js/             JavaScript del frontend

css/            Estilos del frontend

scripts/        Scripts de validación

load-tests/     Pruebas de carga

.github/        Configuración de GitHub Actions

La carpeta principal para esta evaluación es backend/, ya que contiene las funciones relacionadas con pagos, notificaciones y webhooks.

9. Ejecución local

Para ejecutar el backend de forma local primero se debe ingresar a su carpeta:

cd backend

Luego se crea el archivo de variables de entorno utilizando como referencia .env.example:

cp .env.example .env

Después se instalan las dependencias:

npm install

Y finalmente se inicia el servidor:

npm start

Las credenciales reales utilizadas dentro de .env no deben ser subidas al repositorio.


10. Uso de Inteligencia Artificial

Durante el desarrollo de la evaluación se utilizaron DeepSeek y Gemini como herramientas de apoyo. Su uso se concentró principalmente en la revisión de errores que fueron apareciendo durante la configuración de GitHub Actions, además de consultas relacionadas con la sintaxis y estructura del workflow.

Debido a que Monsite es un proyecto grande y ya cuenta con distintas carpetas, dependencias y servicios, durante las pruebas aparecieron varios errores que tomaban bastante tiempo en revisar. En estos casos se utilizaron estas herramientas como apoyo para entender los mensajes de error y agilizar el proceso de búsqueda y revisión.

Las decisiones sobre qué cambios realizar, la implementación final y la validación del funcionamiento fueron realizadas por el equipo. Las respuestas entregadas por las herramientas de IA fueron revisadas y probadas antes de aplicar cualquier cambio al proyecto.

Herramientas utilizadas:

DeepSeek: apoyo en la revisión de errores y consultas sobre la configuración del workflow de GitHub Actions.

Gemini: apoyo en consultas de sintaxis, estructura y revisión de errores durante las pruebas del workflow.


11. Conclusión

La implementación realizada permite aplicar un flujo de trabajo DevOps sobre un proyecto real.

El uso de GitFlow permite mantener una separación entre el código en desarrollo y el código estable. Los Pull Requests agregan una etapa de revisión antes de integrar modificaciones, mientras que GitHub Actions permite automatizar las validaciones del proyecto.

Además, el uso de secretos de GitHub permite trabajar con servicios externos sin exponer credenciales dentro del repositorio.

En conjunto, estas prácticas permiten tener un proceso de desarrollo más ordenado, trazable y seguro, especialmente considerando que Monsite trabaja con funciones importantes como pagos y notificaciones.

12. Reflexiones personales

Benjamin Stavrakopulos:

Con este trabajo pude entender mejor varias cosas que antes conocía más que nada de teoría. Una de ellas fue el tema de las credenciales de Firebase, ya que al principio podría parecer normal dejarlas dentro del proyecto, pero al subirlo a GitHub eso puede terminar exponiendo información que no debería ser pública. Por eso fue importante usar los secretos de GitHub y así poder ocupar esas credenciales en el workflow sin dejarlas directamente en el repositorio.

También me sirvió bastante poder hacer funcionar el workflow y ver que realmente se podía automatizar el despliegue. Antes veía DevOps más relacionado con Git, GitHub y el manejo de ramas, pero haciendo este trabajo me quedó más claro que también tiene que ver con automatizar procesos, revisar los cambios antes de subirlos y tratar de mantener el proyecto más ordenado y seguro.

Más adelante se podrían agregar más pruebas automáticas al workflow y también incluir el backend, para que no solamente se revise y despliegue una parte del proyecto.

Bastian Lazo:

Este trabajo me permitió aplicar conceptos que ya conocía de Git, pero con un nivel de orden mayor al que estaba utilizando anteriormente. Si bien estaba acostumbrado a utilizar diversas ramas, en este caso le di mayor importancia todavía a mantener ese orden e historial de trabajo en diversas ramas del repositorio.

El mayor desafío fue la configuración de GitHub Actions, en concreto la gestión de credenciales en Firebase sin escribirlas directamente en el código, que era algo que pasaba por alto en mis proyectos anteriores.

Esta experiencia me demostró que seguir un flujo de trabajo definido aporta demasiado valor y orden al proyecto, además de poder trabajar con más confianza al momento de implementar cambios gracias a contar con una etapa de revisión previa a su integración en producción.

