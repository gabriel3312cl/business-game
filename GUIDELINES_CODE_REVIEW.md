# Guía de Estilo y Checklist — Lecciones de Code Review

> **Propósito:** consolidar TODOS los hallazgos de code review (Copilot) sobre los repos `propeller-backend` y `propeller-frontend` en una guía accionable. Antes de abrir un PR, revisa las secciones relevantes para no repetir estos errores.
>
> Cada regla incluye: ❌ el anti-patrón concreto que se detectó · ✅ cómo hacerlo bien · 📍 PR/archivo de origen.
>
> Fuentes: backend PRs #422, #426, #430, #431, #433 · frontend PRs #332, #335, #338, #339, #340, #341, #342.

---

## Índice

- [BACKEND (Django / DRF / Python)](#backend-django--drf--python)
  - [B1. Permisos y scoping de queries](#b1-permisos-y-scoping-de-queries)
  - [B2. Validación y normalización de inputs](#b2-validación-y-normalización-de-inputs)
  - [B3. Internacionalización (i18n)](#b3-internacionalización-i18n)
  - [B4. Rendimiento de queries (N+1, prefetch, select_related)](#b4-rendimiento-de-queries-n1-prefetch-select_related)
  - [B5. Redondeo y cálculo monetario](#b5-redondeo-y-cálculo-monetario)
  - [B6. Tipo de cambio (exchange rate)](#b6-tipo-de-cambio-exchange-rate)
  - [B7. Ordenamiento determinista](#b7-ordenamiento-determinista)
  - [B8. Concurrencia y locking](#b8-concurrencia-y-locking)
  - [B9. Manejo de errores de BD (IntegrityError)](#b9-manejo-de-errores-de-bd-integrityerror)
  - [B10. Serializers (partial update, sources anidados, contrato)](#b10-serializers-partial-update-sources-anidados-contrato)
  - [B11. Migraciones y backfills](#b11-migraciones-y-backfills)
  - [B12. Type hints](#b12-type-hints)
  - [B13. Tests (backend)](#b13-tests-backend)
  - [B14. Seeders](#b14-seeders)
  - [B15. Formato de moneda en templates PDF](#b15-formato-de-moneda-en-templates-pdf)
  - [B16. DRY](#b16-dry)
- [FRONTEND (Vue 3 / TypeScript / Nuxt)](#frontend-vue-3--typescript--nuxt)
  - [F1. Imports y declaración de estado en `<script setup>`](#f1-imports-y-declaración-de-estado-en-script-setup)
  - [F2. Tipado y contratos entre componentes](#f2-tipado-y-contratos-entre-componentes)
  - [F3. `null`/`undefined` vs valores falsy (`0`, `''`)](#f3-nullundefined-vs-valores-falsy-0-)
  - [F4. Manejo de errores en composables (rethrow y feedback)](#f4-manejo-de-errores-en-composables-rethrow-y-feedback)
  - [F5. Booleanos en templates y `ComputedRef`](#f5-booleanos-en-templates-y-computedref)
  - [F6. Caché e invalidación de estado](#f6-caché-e-invalidación-de-estado)
  - [F7. Race conditions en búsquedas async](#f7-race-conditions-en-búsquedas-async)
  - [F8. Ciclo de vida de modales / diálogos](#f8-ciclo-de-vida-de-modales--diálogos)
  - [F9. Consistencia de estado y UI](#f9-consistencia-de-estado-y-ui)
  - [F10. Decimales y redondeo en payloads](#f10-decimales-y-redondeo-en-payloads)
  - [F11. SSR (Nuxt) y acceso a `window`](#f11-ssr-nuxt-y-acceso-a-window)
  - [F12. Multi-moneda](#f12-multi-moneda)
  - [F13. Fechas inválidas en comparadores de orden](#f13-fechas-inválidas-en-comparadores-de-orden)
  - [F14. Código muerto, comentarios y código inalcanzable](#f14-código-muerto-comentarios-y-código-inalcanzable)
  - [F15. Filtros de autocomplete (Vuetify)](#f15-filtros-de-autocomplete-vuetify)
  - [F16. Tests (frontend)](#f16-tests-frontend)
- [Checklist rápido pre-PR](#checklist-rápido-pre-pr)

---

# BACKEND (Django / DRF / Python)

## B1. Permisos y scoping de queries

**Regla: usa SIEMPRE el mismo criterio de scoping por cuenta que el resto del viewset. No mezcles `lead__account` con `deal_units__unit__account`.**

- ❌ El lookup de un deal filtra por `lead__account`, mientras otras acciones del mismo viewset (approve/reject/finalize) filtran por `deal_units__unit__account`. Con `lead__account`, deals válidos (broker/compartidos) hacen 404 aunque sus unidades pertenezcan a la cuenta del requester; y en el chequeo de permiso para crear plan de pago, puede permitir crear un plan para un deal cuyas unidades son de otra cuenta (fuga de seguridad).
- ✅ Antes de escribir un `get_object`/filtro de permiso, busca cómo scopean las demás acciones del mismo recurso y replica exactamente ese criterio. Para deals, el criterio canónico es `deal_units__unit__account`.
- 📍 `propeller-backend` #422 · `propeller_api/views/v1/deals.py` (Medium) y `propeller_api/serializers/payment_plans.py` (High).

## B2. Validación y normalización de inputs

**B2.1 — No valides IDs numéricos por truthiness; usa `is not None`.**
- ❌ `if quotation_id:` — si el cliente envía `quotation_id=0` (u otro int falsy), la rama no se ejecuta y el flujo cae erróneamente al path del deal, devolviendo un error de `deal_id` engañoso.
- ✅ `if quotation_id is not None:` para que IDs inválidos-pero-presentes se validen en su propia rama.
- 📍 #422 · `serializers/payment_plans.py` (Medium).

**B2.2 — Normaliza los query params de texto antes de usarlos (`strip`).**
- ❌ `exclude_id` se lee sin `.strip()`. Si el cliente envía `" 123 "` con espacios, la conversión/exclusión falla silenciosamente y el perfil no se excluye del autocomplete.
- ✅ Normaliza (`.strip()`) antes de validar/convertir cualquier query param que pueda venir con espacios.
- 📍 #430 · `views/v1/contacts.py` (Low).

**B2.3 — Endpoints con límite fijo NO deben permitir override del tamaño de página.**
- ❌ El action `autocomplete` usa `CustomPagination`, que permite al cliente subir el tamaño vía `items_per_page`, contradiciendo el requisito de "máximo 10 resultados" y facilitando la enumeración de contactos dentro del tenant.
- ✅ Si un endpoint debe devolver siempre como máximo N, deshabilita el override por query param en ese action (fija el `page_size` sin permitir `items_per_page`).
- 📍 #430 · `views/v1/contacts.py` (Medium).

## B3. Internacionalización (i18n)

**B3.1 — Todo texto nuevo envuelto en traducción DEBE tener su `msgid` en los catálogos.**
- ❌ Textos como `"Exactly one of quotation_id or deal_id must be provided."` y `"The specified deal does not exist or you do not have permission to access it."` van en `_lazy()`/`get_translated_message()` pero no se agregaron a los `.po`; las cuentas no-inglés ven el string en inglés sin traducir.
- ✅ Al agregar texto traducible, agrega el `msgid` correspondiente a `locale/*/LC_MESSAGES/django.po` (o regenera los catálogos). Verifica que no queden strings sin traducción.
- 📍 #422 · `serializers/payment_plans.py` (Medium ×2).

**B3.2 — Los mensajes de error deben ser entity-agnósticos cuando el serializer sirve a múltiples entidades.**
- ❌ El serializer ahora soporta deals vía `entity`, pero varios mensajes de validación siguen hardcodeando "quotation" (mensajes de subsidio de pie, y "quotation total amount" en chequeos de totales). Con `deal_id`, esos mensajes son engañosos para el cliente.
- ✅ Usa wording deal-specific o neutral ("entity"/"negocio o cotización") en todos los mensajes de un serializer polimórfico.
- 📍 #422 · `serializers/payment_plans.py` (Medium ×2).

**B3.3 — Pasa `context` al instanciar serializers anidados manualmente (afecta traducción).**
- ❌ Se instancia `AppliedPaymentPlanItemSerializer` sin pasar `context`, así los serializers anidados (p.ej. `PaymentTypeSerializer`) pierden `auth_user` y devuelven labels en el idioma por defecto en vez del del usuario.
- ✅ Al construir un serializer a mano, propaga `context=self.context` (o `context={'request': ...}`) para no perder `auth_user`/locale.
- 📍 #433 · `public_api/serializers/quotations.py` y `serializers/payment_plans.py` (Medium ×2).

## B4. Rendimiento de queries (N+1, prefetch, select_related)

**B4.1 — Para exponer solo un FK ID, usa la columna `*_id`, no el source anidado.**
- ❌ Sources anidados como `payment_plan_template_item.id`, `payment_method.id`, `template.id`, `quotation.id`, `deal.id` fuerzan a DRF a resolver el objeto relacionado (query extra) salvo que esté prefetcheado, y son frágiles ante `null`.
- ✅ Usa `source='payment_plan_template_item_id'` (la columna FK) para renderizar el ID (o `null`) sin cargar el objeto.
- 📍 #422 · `serializers/payment_plans.py` (Medium ×2).

**B4.2 — No prefetchees relaciones que el serializer no lee.**
- ❌ Se hace `prefetch_related('applied_payment_plan_items__payment_plan_template_item')` pero el serializer solo lee `payment_plan_template_item_id` (la columna FK), que no requiere traer las filas relacionadas → query extra inútil por request.
- ✅ Prefetchea únicamente lo que el serializer efectivamente accede como objeto. Si solo lees el `_id`, elimina el prefetch.
- 📍 #422 · `public_api/views/v1/quotations.py` y `views/v1/deals.py` (Medium ×2).

**B4.3 — No invalides un prefetch re-consultando con `.all().select_related(...)`.**
- ❌ Se hace `prefetch_related('quotations__quotation_units__unit')`, pero más abajo `quotation_group.quotations.all().select_related('seller')` re-crea el queryset y descarta el cache prefetcheado → N+1 al acceder a `q.quotation_units.all()`/`qu.unit`.
- ✅ Itera el related manager ya prefetcheado (sin `.select_related` que lo invalide). Si ya prefetcheas `quotations__seller`, no vuelvas a consultar.
- 📍 #422 · `public_api/views/v1/quotations.py` (Medium) · #426 · `views/v1/quotations.py` (Medium).

**B4.4 — Reusa los items prefetcheados; no fuerces una query nueva en el getter.**
- ❌ `get_applied_payment_plan_items()` siempre emite `.select_related(...).order_by(...)`, ignorando cualquier `prefetch_related` de la vista → query extra por request. Además, en `AppliedPaymentPlanViewSet.create` se serializa el plan recién creado SIN prefetch, así que `PaymentTypeSerializer` dispara N queries (una por item) al acceder a `item.payment_type`.
- ✅ Reusa los items prefetcheados cuando existan; solo cae a una query (con `select_related('payment_type')` + `order_by('position')`) cuando NO fueron prefetcheados. En `create`, agrega el `select_related`/prefetch necesario o ordena en Python.
- 📍 #426 · `serializers/payment_plans.py` (Medium) · #433 · `serializers/payment_plans.py` (Medium).

**B4.5 — Ordena por el FK directo, no atravesando otra relación.**
- ❌ `_build_payment_plan_data_from_applied_payment_plan` ordena por `payment_method__payment_type__...` aunque `AppliedPaymentPlanItem` ya tiene FK `payment_type` y el queryset usa `select_related('payment_type')`. Ordenar por `payment_method` agrega un join innecesario y ralentiza la generación del PDF.
- ✅ Ordena directamente por `payment_type__...` (usa la tabla ya joineada).
- 📍 #426 · `lead/services.py` (Low).

**B4.6 — Usa `distinct=True` en `Count` cuando hay joins que multiplican filas.**
- ❌ `contacts_count=Count('contacts')` sobrecuenta al combinarse con el filtro `leads__seller`: los joins múltiples multiplican el conteo por la cantidad de leads, afectando el ordering `reentry_by_profile_count` para usuarios sin permisos admin.
- ✅ `Count('contacts', distinct=True)` para evitar el sobreconteo por joins.
- 📍 #430 · `views/v1/contacts.py` (Medium).

**B4.7 — Un cambio de payload por defecto (agregar relaciones al serializer) debe ser intencional y documentado.**
- ❌ `QuotationSerializer` ahora SIEMPRE incluye `quotation_units`: cambio de payload/comportamiento no mencionado en la descripción del PR, y puede introducir queries extra en endpoints que no lo necesitaban.
- ✅ Si agregas campos/relaciones al serializer base, evalúa el impacto en todos sus consumidores y documéntalo; considera un serializer específico en vez de engordar el base.
- 📍 #422 · `serializers/quotations.py` (Medium).

## B5. Redondeo y cálculo monetario

**Regla: fija SIEMPRE el modo de redondeo explícito y consistente entre preview y persistencia.**
- ❌ `source_total_amount` y `default_total_amount` se cuantizan sin modo de redondeo explícito, usando el default de `Decimal` (`ROUND_HALF_EVEN`). Esto hace que los totales/porcentajes del preview (pre-nota) difieran del path real de creación del plan, que usa `ROUND_HALF_UP` (ver `serializers/payment_plans.py:_round_currency`).
- ✅ Especifica `ROUND_HALF_UP` (o el modo que use el path de persistencia) en toda cuantización monetaria, para que preview y plan guardado coincidan al centavo.
- 📍 #426 · `lead/services.py` (Medium ×2).

## B6. Tipo de cambio (exchange rate)

**Regla: el preview debe usar la MISMA fuente de tipo de cambio que la creación real.**
- ❌ El preview de pre-nota usa el `exchange_rate` enviado por el cliente, pero la creación real (`AppliedPaymentPlanCreateSerializer.validate`) IGNORA el `exchange_rate` del payload y siempre usa la tasa oficial de la cuenta (`currency.services.get_conversion_rate`, ver `serializers/payment_plans.py:919-936`). El PDF preview puede mostrar valores/porcentajes distintos a lo que efectivamente se guardaría/validaría.
- ✅ Deriva el `exchange_rate` del preview desde `currency.services.get_conversion_rate(...)` (misma lógica que creación), y devuelve 400 cuando no exista tasa oficial.
- 📍 #426 · `lead/services.py` (Medium, reportado en inglés y español).

## B7. Ordenamiento determinista

**Regla: `order_by('position')` NO es estable ante empates. Agrega SIEMPRE `pk` como segundo criterio.**
- ❌ `order_by('position')` puede devolver un orden no determinista si existen posiciones duplicadas (p.ej. durante/tras un backfill parcial, o si el seed corre en un deploy entre migraciones 0005 y 0006).
- ✅ `order_by('position', 'pk')` — estabiliza sin cambiar el orden cuando `position` ya es único. Aplícalo en TODOS los puntos que ordenen por `position`.
- 📍 #433 · múltiples: `views/v1/payment_plans.py`, `serializers/payment_plans.py` (fallback sin prefetch), `commands/seed_test_data.py`, `project/services.py`, `public_api/serializers/quotations.py` (Low/Medium).

## B8. Concurrencia y locking

**Regla: si dos flujos calculan `max(position)+1` o reordenan, deben serializarse bloqueando el MISMO registro padre.**
- ❌ El reorder (update) bloquea las filas de items pero NO el `PaymentPlanTemplate`. Como `add-payment-method` sí bloquea el template para calcular `max(position)+1`, ambos flujos pueden correr concurrentemente (reorder + add) y asignar posiciones en paralelo, dejando `position` duplicadas/inconsistentes.
- ✅ Bloquea también el `PaymentPlanTemplate` (`select_for_update` sobre el padre) en el reorder, para serializar ambos cambios y evitar colisiones.
- 📍 #433 · `serializers/payment_plans.py` (High).

## B9. Manejo de errores de BD (IntegrityError)

**Regla: no detectes constraints por substring del mensaje de error.**
- ❌ Detectar colisiones de unique-constraint por substring del string de la excepción es frágil entre backends/versiones de driver, y puede degradar silenciosamente al mensaje genérico si el texto del error cambia.
- ✅ Usa el `constraint_name` subyacente cuando esté disponible (p.ej. `psycopg` expone `diag.constraint_name`), en vez de buscar substrings.
- 📍 #422 · `serializers/payment_plans.py` (Low, dos hilos).

## B10. Serializers (partial update, sources anidados, contrato)

**B10.1 — En `partial_update`, NO borres colecciones que el payload simplemente omitió.**
- ❌ En `partial_update` el serializer se usa con `partial=True`, así que el payload puede omitir `payment_plan_template_items`. Hoy `update()` hace `pop(..., [])` y luego marca como eliminados TODOS los items existentes cuando el array no viene → puede borrar accidentalmente el plan completo al editar solo `name`/`description`.
- ✅ Distingue "campo ausente" de "lista vacía explícita": si la clave no está en `validated_data`, NO toques los items; solo reconcilia cuando el cliente envía la lista intencionalmente.
- 📍 #433 · `serializers/payment_plans.py` (High).

**B10.2 — Sources anidados de FK IDs: ver [B4.1](#b4-rendimiento-de-queries-n1-prefetch-select_related).**

**B10.3 — Respeta el contrato declarado del endpoint; no expongas datos extra sin acordarlo.**
- ❌ El PR dice que el autocomplete devuelve solo `id` y `full_name`, pero el serializer agrega `display_name` y además puede incluir `email` y `phone` dentro de ese string cuando hay nombres duplicados. Esto cambia el contrato y puede exponer datos que el consumidor no esperaba (privacidad).
- ✅ Alinea el comportamiento con el contrato (elimina `display_name` o hazlo sin email/teléfono) y ajusta tests/consumidor; o actualiza la descripción del PR para reflejar el contrato real. Decide explícitamente.
- 📍 #430 · `serializers/contacts.py` (Medium).

## B11. Migraciones y backfills

**Regla: un backfill NO debe pisar datos "custom" ya existentes, ni asumir estados intermedios de un deploy rolling.**

- ❌ **(a)** La migración 0006 reescribe `position` para todas las filas donde `position != index`. Si se ejecuta después de que ya hubo reorders/altas que setean `position` (p.ej. deploy rolling entre 0005 y 0006), el backfill pisa la configuración nueva y vuelve al orden legacy.
- ❌ **(b)** El backfill asume que cualquier grupo con algún `position != 0` ya fue "gestionado" y lo salta. Pero en un deploy entre 0005 y 0006, `add-payment-method` puede crear un ítem con `position=1` mientras los existentes siguen en 0; con esa condición el grupo queda con posiciones duplicadas para siempre (no se renumera).
- ✅ Evita modificar grupos donde ya existan posiciones "custom" (deja el backfill como no-op cuando detecta posiciones no-default), pero salta solo si el conjunto de posiciones ya es **válido/completo** (no solo si "hay algún != 0"). Piensa explícitamente en el escenario deploy rolling.
- 📍 #433 · `payment_plan/migrations/0006_backfill_payment_plan_item_position.py` (Medium ×2).

## B12. Type hints

**Regla: el type hint debe reflejar el tipo real retornado.**
- ❌ La anotación dice `list[QuotationGroup]` pero la función retorna un `QuerySet` de Django. El desajuste confunde a callers y análisis estático.
- ✅ Anota como `Iterable[QuotationGroup]` (ya importado) salvo que realmente materialices con `list(...)`.
- 📍 #422 · `project/services.py` (Low).

## B13. Tests (backend)

**B13.1 — Cubre con tests el caso EXACTO que motivó el bug.**
- ❌ Falta cobertura para el helper de timeline y para el default de `entry_date`: los tests solo validan conteos/orden. El bug era de zona horaria (un `DateField` `entry_date` corriéndose al día anterior).
- ✅ Agrega un test que fije un `created_at` cercano a medianoche UTC con una cuenta en TZ negativa (p.ej. UTC-4) y verifique que el timestamp cae en el mismo día calendario local esperado (y no el anterior). Cubre el default de `entry_date` tanto en `services.py` como en el serializer/API.
- 📍 #431 · `lead/timeline/common.py`, `propeller_api/services.py`, `serializers/leads.py` (Medium ×3).

**B13.2 — `freeze_time` con string naïve se interpreta en la TZ local del runner; fija UTC explícito.**
- ❌ El test asume que el tiempo congelado es "02:00 UTC", pero `freeze_time("...")` con un string naïve se interpreta en la zona local del runner → no determinista según el entorno.
- ✅ Usa `tz_offset=0` (o un string con `+00:00`) para que `freeze_time`/`arrow.utcnow()` representen realmente UTC.
- 📍 #431 · `lead/tests/test_entry_date_timezone.py` (Medium ×2).

**B13.3 — No exijas igualdad exacta de número de queries; asegura que no aumente.**
- ❌ El test exige igualdad exacta de conteo de queries; es frágil ante caches/warmups (la segunda medición puede tener menos queries).
- ✅ Afirma que `many` no sea **mayor** que `few` (`assertLessEqual`), en vez de igualdad estricta.
- 📍 #433 · `tests/test_quotations.py`, `tests/test_payment_plans.py` (Low ×2).

**B13.4 — Evita `suppress(IndexError)` para recorrer pares adyacentes; usa `zip`.**
- ❌ El test compara timestamps como strings y usa `contextlib.suppress(IndexError)` para evitar el último índice: depende de un `IndexError` para terminar el loop.
- ✅ Itera pares adyacentes con `zip(seq, seq[1:])` — más claro y sin try/except implícito.
- 📍 #431 · `tests/test_leads.py`, `tests/test_client_profile.py` (Low ×2).

**B13.5 — No dejes variables locales sin usar en fixtures (linters).**
- ❌ Variable local `client` sin usar en un fixture → dispara linters (flake8 F841).
- ✅ Si es intencionalmente no usada, asigna a `_`; si no, elimínala.
- 📍 #422 · `tests/test_deal_payment_plans.py` (Low).

## B14. Seeders

**Regla: los seeders deben ser idempotentes — actualiza los campos aunque el registro ya exista.**
- ❌ El seeder usa `get_or_create(... defaults={'position': index})`; si el ítem ya existía (seed corrido antes del cambio), `position` NO se actualiza y quedan valores duplicados (típicamente 0), volviendo el orden no determinista.
- ✅ Actualiza `position` cuando el registro ya existe (patrón `update_or_create`, o setear y `save()` tras el `get_or_create`).
- 📍 #433 · `commands/seed_test_data.py` (Medium).

## B15. Formato de moneda en templates PDF

**Regla: en templates sin `quotation` en contexto (p.ej. sale note), `format_currency` no toma el `number_format` de la cuenta.**
- ❌ `format_currency` infiere el formato desde `quotation` del contexto. En el PDF de sale note NO hay quotation → cae al formato "point" por defecto aunque la cuenta use otro `number_format`. Afecta montos, totales por bucket y el display del tipo de cambio.
- ✅ Usa el filtro `currency` pasando explícitamente `seller.account.number_format` en todos los montos del template de sale note.
- 📍 #426 · `templates/pdf/sale_note.html` (Medium ×4).

## B16. DRY

**Regla: no dupliques lógica de formateo entre serializers.**
- ❌ `ClientProfileAutocompleteSerializer.get_full_name` duplica exactamente la lógica de `ClientProfileModelSerializer.get_full_name` → riesgo de divergencia si cambia cómo se compone el nombre.
- ✅ Centraliza en un helper estático reutilizable por ambos serializers.
- 📍 #430 · `serializers/contacts.py` (Low).

---

# FRONTEND (Vue 3 / TypeScript / Nuxt)

## F1. Imports y declaración de estado en `<script setup>`

**F1.1 — Importa todo lo que uses de `vue`.**
- ❌ Se usan `computed` y `watch` sin importarlos de `vue` → error de runtime/compilación.
- ✅ Verifica que `computed`, `watch`, `ref`, etc. estén importados. (Si usas auto-import de Nuxt, confirma que esté configurado para ese archivo.)
- 📍 #332 · `AddDealForm.vue` (High).

**F1.2 — Declara como `ref` cualquier estado usado en el template.**
- ❌ `hoveredIndex` se usa en el template (`@mouseenter`/`@mouseleave`) pero no está declarado en `<script setup>` → estado no reactivo, warnings/errores en runtime.
- ✅ Declara `const hoveredIndex = ref(...)` junto al resto del estado local (o elimínalo si no se lee — ver [F14](#f14-código-muerto-comentarios-y-código-inalcanzable)).
- 📍 #339 · `ClientProfileComparecientes.vue` (High).

## F2. Tipado y contratos entre componentes

**F2.1 — Los tipos de respuesta deben reflejar nullabilidad real.**
- ❌ `paymentPlanTemplateItemId` y `paymentType` son nullable/opcionales en runtime (el código usa optional chaining y maneja `paymentType: null`), pero el tipo no lo declara. Igual `templateId`, usado en paths donde puede faltar (resolución por `templateName`, registros antiguos).
- ✅ Marca esos campos como opcionales/nullable en el tipo de respuesta para evitar supuestos incorrectos.
- 📍 #332 · `types/api/responses/payment-plans/paymentPlansResponse.ts` (Medium ×2).

**F2.2 — Inicializa las estructuras con el tipo correcto.**
- ❌ `formData.discount` se usa como `Record<number, DealUnitRawPayload>` (indexado por `unit.id`, consumido con `Object.values(...)`) pero se inicializa como `[]` → pierde type-safety y oculta errores array-vs-objeto.
- ✅ Inicialízalo como `{}` con el tipo `Record<number, ...>`.
- 📍 #332 · `AddDealForm.vue` (Medium).

**F2.3 — Los handlers deben tipar el payload REAL que emite el hijo (no una versión reducida).**
- ❌ Los handlers de `DealPaymentPlanStep` (`handlePaymentPlanDataChange`, `handlePaymentItemsChange`) tipan el payload SIN `inputDecimals` ni la metadata que emite `QuotationPaymentPlan` (`appliesToDeed`, `isDownPaymentSubsidy`, `isFixedAmount`, `isMortgageCredit`). El wrapper queda incompatible en TS y se pierde info necesaria para el ajuste por redondeo en el submit.
- ✅ Tipa los listeners con el tipo exacto que emite el componente hijo; re-emite el payload completo, sin descartar campos.
- 📍 #335 · `DealPaymentPlanStep.vue` y `AddDealForm.vue` (Medium ×3).

**F2.4 — No pases un valor de un tipo a una función que espera otro; aliasea tipos que colisionan.**
- ❌ `uploadDocument` espera un `File` (`useDocument.ts:17`), pero se le pasa `fileData.value`, tipado como `FileData` (metadata del backend, donde `file` es `string`), mientras `DropZone` emite `{ file: File, url: string }`. La mezcla de tipos rompe TS y facilita pasar un valor incorrecto al servicio.
- ✅ Tipa `fileData` como `Ref<File | null>` y el argumento de `handleFileData` con lo que emite `DropZone` (p.ej. `interface UploadFileData { file: File; url: string }`). Si aún necesitas el `FileData` del backend para la lista, aliásalo: `import type { FileData as DocumentFileData } from ...`.
- 📍 #341 · `Documents.vue` (Medium).

**F2.5 — Evita retornar uniones amplias cuando el payload es conocido; usa overloads.**
- ❌ `apiCreateAppliedPaymentPlan` siempre retorna `QuotationPaymentPlanResponse | DealPaymentPlanResponse` aun cuando el payload es conocido, degradando la inferencia de `createQuotationPaymentPlan`/`createDealPaymentPlan` y obligando a narrowing innecesario.
- ✅ Define overloads tipados según el payload de entrada.
- 📍 #332 · `services/paymentPlanService.ts` (Low).

**F2.6 — Aserción no-null al pasar valores `| null` a props requeridas (type-check de templates).**
- ❌ `AppliedPaymentPlanDetail` requiere `AppliedPaymentPlanResponse`, pero se le pasa `appliedPlan`/`suggestedQuotationPaymentPlan` tipados como `... | null`. Aunque el `v-if`/`v-else` garantiza no-null en runtime, el type-checker de templates puede marcarlo.
- ✅ Usa aserción no-null (`appliedPlan!`) o ajusta el prop para aceptar `null` y manejarlo dentro del componente.
- 📍 #332 · `QuotationPaymentPlanDetail.vue` (Medium) y `AddDealForm.vue` (Low).

**F2.7 — Normaliza retornos que a veces son array y a veces ResponseDTO.**
- ❌ `linkedProfiles` se llena con `getLinkedProfiles()`, que en otros puntos puede devolver un `ResponseDTO` en vez de un array. El template asume array (`.length`, `v-for="... in linkedProfiles"`), así que si viene un DTO no se muestra la lista aunque existan vinculados.
- ✅ Normaliza a una lista (`linkedProfilesList`) y úsala en `v-if`/`v-for`.
- 📍 #339 · `ClientProfileComparecientes.vue` (High ×2).

## F3. `null`/`undefined` vs valores falsy (`0`, `''`)

**F3.1 — No uses `||` para fallback cuando `0` es un valor válido.**
- ❌ `currentTotalAmount` usa `||` para caer a `paymentPlan.defaultTotalAmount`, tratando `0` como falsy. Si el total real del negocio es 0 (descuento total), usará el total de la cotización en vez de 0.
- ✅ Usa `??` (nullish coalescing) para distinguir `0`/`''` de `null`/`undefined`.
- 📍 #332 · `AddDealForm.vue` (Medium).

**F3.2 — No valides IDs numéricos por truthiness (mismo error que backend B2.1).**
- ❌ Chequeos "truthy" sobre ids numéricos (`fieldToDelete`, `contact.value?.id`): si un id válido fuera `0`, se bloquearía la acción. Además `fieldToDelete` puede ser `null` y se pasaría a `deleteLinkedProfile` (que espera `number`), fallando en runtime.
- ✅ Compara explícitamente contra `null`/`undefined` (`id != null`) antes de llamar al servicio, de forma consistente en todo el componente (`addCompareciente` ya lo hace bien).
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium/Low ×3).

**F3.3 — IDs `number | null` no deben construir keys/strings directamente.**
- ❌ `paymentPlan.templateId` y `paymentPlanTemplateItemId` son `number | null`; se usan directo para construir `paymentPlanTemplateId` y las keys de `paymentItems` → pueden terminar en `"null"`/`NaN` o keys inválidas.
- ✅ Verifica no-null antes de construir keys derivadas; maneja el caso null explícitamente.
- 📍 #332 · `AddDealForm.vue` (High).

## F4. Manejo de errores en composables (rethrow y feedback)

**Regla transversal: si un composable captura el error y devuelve `undefined` en vez de lanzar, los `try/catch` de los callers NO se ejecutan y el usuario queda sin feedback (o ve un falso éxito).**

- ❌ **(a)** `createQuotationPaymentPlan` solo lanza cuando `handleErrorNotInWhitelist` decide lanzar; para errores whitelisted retorna `undefined` en silencio. Callers como `pages/quotation/create/from/[source].vue` envuelven en `try/catch` y dependen de la excepción para abortar la navegación cuando falla la creación del plan.
- ❌ **(b)** `createLinkedProfile` captura el error y devuelve `undefined`; si falla, igual se hace `fetchLinkedProfiles()` y se cierra el modal, dejando al usuario sin feedback.
- ❌ **(c)** `deleteLinkedProfile` captura el error y devuelve `undefined`; el `try/catch` no se ejecuta ante fallo y se muestra el snackbar de éxito igual.
- ❌ **(d)** `getLinkedProfiles` captura el error y no lo relanza; el `catch` de `fetchLinkedProfiles()` es inalcanzable. Ante fallo asigna `[]` y el usuario ve "No hay perfiles vinculados" sin feedback.
- ✅ Decide una convención consistente: **relanza siempre después de manejar** (como `createDealPaymentPlan`), o verifica el retorno (`undefined`) antes de continuar (no cierres el modal / no muestres éxito). Elimina los `catch` inalcanzables (mantén `finally`).
- 📍 #332 · `usePaymentPlans.ts` (High) · #339 · `ClientProfileComparecientes.vue` (High ×2 + Medium).

**F4.1 — Limpia el estado de error en early-returns para permitir reintentos.**
- ❌ Si `createLinkedProfile` falla, el composable setea `error.value`, y como el modal usa `v-if="error"` se oculta el autocomplete; con el `return` tras el snackbar, el usuario queda bloqueado para reintentar sin cerrar/reabrir el modal.
- ✅ Limpia `error` en ese early-return (o maneja el error localmente) para permitir reintentos.
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium).

## F5. Booleanos en templates y `ComputedRef`

**F5.1 — `Boolean(computedRef)` es SIEMPRE `true` (un ref es un objeto). Usa `.value` o desestructura.**
- ❌ `:needs-exchange-rate="Boolean(needsExchangeRate)"` siempre evalúa `true` porque `needsExchangeRate` es un `ComputedRef` (objeto truthy). Hace que `QuotationPaymentPlan` crea que siempre requiere TC e invalida el paso incluso con monedas iguales.
- ✅ Pasa el valor (`needsExchangeRate` sin `Boolean(...)` en template — Vue lo desenvuelve — o `needsExchangeRate.value` en script). Nunca envuelvas un ref en `Boolean()`.
- 📍 #332 · `DealPaymentPlanStep.vue` (High).

**F5.2 — Fuerza a boolean los computed que encadenan con `&&`/`||`.**
- ❌ `needsExchangeRate` puede devolver `string`/`undefined` por encadenamiento con `&&` (si `accountCurrency` es falsy); `isDifferentCurrency` puede devolver `''`. El computed no es estrictamente booleano → condiciones/tipos ambiguos aguas abajo.
- ✅ Envuelve el resultado en `Boolean(...)` / `!!(...)` dentro del computed (no en el template sobre un ref — ver F5.1).
- 📍 #332 · `DealPaymentPlanStep.vue` y `AppliedPaymentPlanDetail.vue` (Medium/Low).

## F6. Caché e invalidación de estado

**Regla: la key de caché de una sugerencia debe firmar TODOS los inputs de los que depende (unidades + descuentos + bono pie), no solo unidades.**

- ❌ **(a)** `findQuotationPaymentPlanSuggestion` hace early-return si ya existe `suggestedQuotationPaymentPlan`, pero esa sugerencia depende de unidades/descuentos. Si el usuario vuelve atrás y cambia unidades o bono pie, se sigue mostrando una sugerencia obsoleta.
- ❌ **(b)** La caché firma solo por IDs de unidades (`suggestedForUnitsKey`/`unitsKey`), aunque debe invalidarse también ante cambios de descuentos/bono pie. Se guarda `unitsKey` en vez de la key compuesta.
- ❌ **(c)** Al aplicar un plan sugerido y luego cambiar unidades/descuentos, `appliedQuotationPaymentPlanId`/`formData.paymentPlan`/`paymentItems` quedan apuntando al plan previo; la UI lo muestra como "aplicado" y el submit usa datos viejos → plan inconsistente para el nuevo total/unidades.
- ✅ Usa una key compuesta (`paymentPlanSuggestionKey` = unidades + descuentos + bono pie) tanto para el guard como para guardar la firma. Invalida automáticamente el plan aplicado y la sugerencia cacheada cuando cambie esa key (vía `watch`).
- 📍 #332 · `AddDealForm.vue` (High + Medium ×4).

**F6.1 — Al invalidar la sugerencia, NO borres un plan armado manualmente.**
- ❌ `watch(paymentPlanSuggestionKey, ...)` invalida la sugerencia pero SIEMPRE llama `clearAppliedQuotationPaymentPlan()`, reseteando `formData.paymentPlan`/`paymentItems` aunque el usuario haya armado un plan manual (sin `appliedQuotationPaymentPlanId`).
- ✅ Solo limpia si había un plan aplicado desde sugerencia (`appliedQuotationPaymentPlanId` presente); preserva el plan manual del usuario.
- 📍 #332 · `AddDealForm.vue` (Medium).

**F6.2 — Resetea el estado interno de componentes hijos que no controlas (`AppAutocomplete`).**
- ❌ Aunque limpias `availableContacts`/`selectedContactId`, el texto escrito persiste porque `AppAutocomplete` maneja su búsqueda con `localSearch` interno (no controlado desde el padre). El modal puede reabrirse con el texto anterior. Al limpiar con la "x", tampoco se resetea.
- ✅ Fuerza un remount con `:key` que cambie al abrir/cerrar el diálogo, e incrementa `autocompleteKey` también en `clearSelectedContact`.
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium ×2).

## F7. Race conditions en búsquedas async

**F7.1 — Captura la key/requestId al inicio del async y valida vigencia antes de escribir estado.**
- ❌ `findQuotationPaymentPlanSuggestion` actualiza `suggestedQuotationPaymentPlan`/`suggestedQuotation`/`suggestedPlanKey` usando el valor ACTUAL de `paymentPlanSuggestionKey`. Si el usuario cambia unidades/descuentos o navega mientras el request está en vuelo, uno viejo puede escribir una sugerencia obsoleta (y marcarla como cache válida para la key nueva).
- ✅ Captura la key (o un `requestId`) al inicio y, antes de setear estado/caché, verifica que siga siendo la vigente.
- 📍 #335 · `AddDealForm.vue` (Medium).

**F7.2 — Limpia la lista de resultados al iniciar/al fallar una búsqueda (solo si el request sigue vigente).**
- ❌ Al iniciar una nueva búsqueda, `availableContacts` no se limpia → mientras llega la respuesta se muestran resultados de la búsqueda anterior (que pueden no corresponder al texto actual) y el usuario podría seleccionar un contacto incorrecto. Igual si la búsqueda falla: quedan resultados viejos.
- ✅ Limpia la lista al marcar `isSearchingContacts = true`, y ante error (validando que el request siga siendo el vigente).
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium ×2).

**F7.3 — Valida los parámetros de utilidades de batching para evitar loops infinitos.**
- ❌ `resolveInBatches` puede entrar en loop infinito si se llama con `batchSize <= 0` (porque `batchStart += batchSize` no avanza).
- ✅ Valida explícitamente `batchSize > 0` (lanza o normaliza) al inicio.
- 📍 #332 · `dealPaymentPlanSuggestion.ts` (Medium).

**F7.4 — Acota el type guard del `filter` a `R`, no a `Awaited<R>`.**
- ❌ En `resolveInBatches`, el type guard del `filter` usa `Awaited<R>`, pero `batchResults` ya es `(R | null)[]` (porque se hace `await resolveItem`). `Awaited<R>` infiere mal si alguien pasa `R` como `Promise<...>` (empujarías Promises a `results` mientras el tipo dice valores resueltos).
- ✅ Acota a `R` en el type guard (`(x): x is R => x !== null`).
- 📍 #335 · `dealPaymentPlanSuggestion.ts` (Medium, reportado varias veces).

## F8. Ciclo de vida de modales / diálogos

**Regla: el cierre del diálogo por ESC o clic-fuera también debe ejecutar tu `closeDialog()`.**
- ❌ Si el usuario cierra el `VDialog` con ESC o clic fuera, `closeDialog()` no se ejecuta (solo cambia `isLinkedProfileModalOpen`), dejando `isSearchingContacts`/`availableContacts`/`selectedContactId` con estado viejo para la próxima apertura.
- ✅ Vincula el cierre a `closeDialog()` con `@update:model-value` (ejecutándolo solo cuando pase a `false`).
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium).

## F9. Consistencia de estado y UI

**F9.1 — Sincroniza TODOS los campos derivados cuando cambia el estado base.**
- ❌ `hasDealOutcome` se basa en `lead.leadStepLabel !== lead.step.name`, pero al cambiar de paso solo se actualiza `lead.step` (no `lead.leadStepLabel`). Tras un cambio exitoso, `leadStepLabel` queda con el valor anterior y `hasDealOutcome` pasa a `true`, bloqueando el menú y mostrando un chip con etiqueta desactualizada.
- ✅ Actualiza `leadStepLabel` junto con `lead.step` (o deriva ambos de una única fuente).
- 📍 #340 · `LeadInfoCard.vue` (High).

**F9.2 — El preview de solo lectura debe reflejar los montos recalculados que se enviarán.**
- ❌ Al aplicar un plan sugerido (`applySuggestedQuotationPaymentPlan`) se recalculan montos y se guardan en `formData.paymentItems`, pero el preview de solo lectura muestra `suggestedQuotationPaymentPlan` SIN esos montos recalculados → UI inconsistente ("N cuotas / X c/u") con lo que se enviará en el submit y con la pre-nota.
- ✅ El preview debe renderizar los montos recalculados (los mismos que el submit).
- 📍 #335 · `AddDealForm.vue` (Medium).

**F9.3 — Bloquea el avance del wizard cuando hay un fallo pendiente de resolver.**
- ❌ Cuando `hasPaymentPlanFailure` es `true` (deal creado pero falló aplicar el plan), el wizard debería quedar bloqueado en ese paso forzando Reintentar/Continuar sin plan. `disabledNext` no considera `hasPaymentPlanFailure`, así que el usuario aún puede avanzar.
- ✅ Incluye `hasPaymentPlanFailure` en `disabledNext`.
- 📍 #332 · `AddDealForm.vue` (Medium).

**F9.4 — El flujo de error debe coincidir con lo que declara el PR/UX (o alinear la descripción).**
- ❌ El flujo de error al crear el plan del Deal no coincide con la descripción del PR: ante fallo el modal NO se cierra; se guarda `createdDeal`, se marca `hasPaymentPlanFailure` y se vuelve al paso de Plan de Pago. Además el snackbar de fallo usa timeout por defecto (5s) y no se emite `deal-created` hasta que el usuario cierre el modal, aunque el Deal ya existe en BD.
- ✅ Decide y alinea: si lo esperado es "cerrar modal + snackbar persistente", ciérralo inmediatamente y haz el snackbar persistente, y emite `deal-created` de una vez; si el modal debe quedar abierto para reintentar, actualiza la descripción/criterio de UX.
- 📍 #332 · `AddDealForm.vue` (Medium ×2).

**F9.5 — No ocultes ítems con `paymentType === null`.**
- ❌ Los ítems con `paymentType === null` quedan fuera de `appliesToDeedItems`/`notAppliesToDeedItems`/`otherItems` y no se renderizan en ninguna tabla (se "pierden" en la UI). El tipo ahora permite `paymentType: ... | null`.
- ✅ Muestra esos ítems al menos en el grupo "Otras formas de pago".
- 📍 #335 · `AppliedPaymentPlanDetail.vue` (Medium).

**F9.6 — Distingue "error de carga" de "ausencia real de datos (204)".**
- ❌ Con `loadPaymentPlan` devolviendo `undefined` en errores, el template solo puede mostrar "sin plan" o el detalle → confunde un error de carga con la ausencia real de plan (204).
- ✅ Agrega un estado explícito de error (p.ej. `loadFailed`).
- 📍 #335 · `QuotationPaymentPlanDetail.vue` (Medium).

**F9.7 — Usa el texto adecuado según el estado (placeholder vs no-data-text).**
- ❌ `no-data-text = "Escribe al menos 2 caracteres..."` se muestra también cuando la búsqueda ya tiene ≥2 caracteres y no hay resultados (o al filtrar por ya vinculados) → confuso.
- ✅ Mueve ese mensaje a `placeholder` y usa un `no-data-text` neutral para el estado "sin resultados".
- 📍 #339 · `ClientProfileComparecientes.vue` (Medium).

## F10. Decimales y redondeo en payloads

**F10.1 — Respeta los decimales del formulario (`inputDecimals`); no fuerces 2 decimales fijos.**
- ❌ `formData.paymentPlan` no guarda `inputDecimals` (que `QuotationPaymentPlan` emite), y `buildPreSalePaymentPlanPayload` redondea a 2 decimales fijo. Con monedas como UF (3-4 decimales), los payloads pueden fallar validaciones o cambiar montos, y la pre-nota no refleja lo mismo.
- ✅ Propaga y usa `inputDecimals` en el redondeo de payloads (submit y pre-nota).
- 📍 #335 · `AddDealForm.vue` (Medium ×2).

**F10.2 — El ajuste por redondeo debe replicar EXACTAMENTE las reglas de dominio del backend.**
- ❌ En `submitDealPaymentPlan`, el ajuste por redondeo fuerza que la suma de TODOS los ítems (`paymentPlanItems.reduce(...)`) cuadre con `totalUnitsAmount`. Pero en el flujo de cotización, el backend valida el 100% solo para el grupo `applies_to_deed`, y el ajuste se aplica únicamente a esos ítems, excluyendo bono pie (`isDownPaymentSubsidy`) y montos fijos (`isFixedAmount`), prefiriendo el crédito hipotecario (`isMortgageCredit`) (ver `pages/quotation/create/from/[source].vue:522-551`). Con el enfoque actual, un ítem `not_applies_to_deed`/`other` (p.ej. subsidio) puede alterarse indebidamente o "compensar" el diff.
- ✅ Replica la lógica de cotización: ajusta solo `applies_to_deed`, evita `subsidy`/`fixed_amount`, prefiere el crédito hipotecario. Esto requiere que `DealPaymentPlanStep` emita la metadata (`appliesToDeed`/`isDownPaymentSubsidy`/`isFixedAmount`/`isMortgageCredit`) o que el submit la resuelva desde el template antes de ajustar.
- 📍 #335 · `AddDealForm.vue` (High, reportado dos veces).

## F11. SSR (Nuxt) y acceso a `window`

**Regla: no referencies `window` directamente en el setup; usa la forma SSR-safe de VueUse.**
- ❌ `useEventListener(window, ...)` referencia `window` durante el setup del componente → en SSR (Nuxt) puede romper el render del servidor con `ReferenceError: window is not defined`.
- ✅ Usa `useEventListener('event', handler)` (sin pasar `window` explícito) para que VueUse resuelva el target de forma segura en SSR — patrón ya usado en `@layouts/components/HorizontalNavPopper.vue:69`.
- 📍 #342 · `PaymentMethodDraggableList.vue` (High).

## F12. Multi-moneda

**Regla: no asumas una sola moneda desde `units[0]` si se pueden seleccionar unidades de proyectos distintos.**
- ❌ Se asume una sola moneda usando `units[0].currencyDisplay`, pero `UnitTableListDeal` permite seleccionar unidades de proyectos distintos (potencialmente con monedas distintas). En ese caso los totales se sumarían sin conversión y `needsExchangeRate` quedaría basado solo en la primera unidad → montos/plan inválidos.
- ✅ Detecta múltiples monedas entre las unidades seleccionadas y maneja el caso (conversión / bloqueo / advertencia); no derives la moneda del primer elemento.
- 📍 #335 · `DealPaymentPlanStep.vue` (High).

## F13. Fechas inválidas en comparadores de orden

**Regla: normaliza fechas inválidas antes de comparar, o el orden queda impredecible.**
- ❌ `sortQuotationsByExpiration` usa `new Date(bDate).getTime()` / `new Date(aDate).getTime()`; y `orderedQuotationGroups` usa `new Date(createdAt).getTime()`. Si `expirationDate`/`createdAt` viene `null`/`undefined` o con formato inválido, `getTime()` devuelve `NaN`, el comparator retorna `NaN` y el orden queda impredecible (puede cambiar qué cotización se sugiere).
- ✅ Normaliza fechas inválidas a un timestamp fijo (p.ej. `0`) antes de comparar.
- 📍 #335 · `AddDealForm.vue` (Medium ×2).

## F14. Código muerto, comentarios y código inalcanzable

**F14.1 — Elimina estado muerto.**
- ❌ `hoveredIndex` solo se asigna en `@mouseenter`/`@mouseleave` pero no se lee en ninguna parte → estado muerto que añade complejidad.
- ✅ Elimínalo (y sus handlers) o úsalo para condicionar la UI (p.ej. mostrar el botón eliminar solo en hover). *(Nota: se contradice con F1.2 según si se decide usarlo o no — decide una de las dos.)*
- 📍 #339 · `ClientProfileComparecientes.vue` (Low).

**F14.2 — No marques `async` funciones sin `await`.**
- ❌ `handleDeleteLinkedProfile` está marcado `async` pero no contiene ningún `await` → complejidad innecesaria y confusión sobre el flujo asíncrono.
- ✅ Quita `async` si no hay `await`.
- 📍 #339 · `ClientProfileComparecientes.vue` (Low).

**F14.3 — Elimina código inalcanzable tras funciones que siempre lanzan.**
- ❌ `handleApiError` está tipado como `never` y siempre lanza; el `throw error` posterior en el `catch` de `fetchLinkedProfiles` es inalcanzable y añade ruido. Igual el `catch` de `fetchLinkedProfiles` cuando el composable no relanza (ver F4).
- ✅ Elimina el código inalcanzable (mantén `finally` si aplica).
- 📍 #339 · `contactService.ts` (Low) y `ClientProfileComparecientes.vue` (Medium).

**F14.4 — Los comentarios deben describir lo que el código realmente hace.**
- ❌ Un comentario dice que la función "filtra los planes sin items", pero en realidad solo normaliza `appliedPaymentPlanItems` para que nunca sea `undefined` (el filtrado ocurre después con el `length`).
- ✅ Ajusta el comentario a lo que efectivamente hace el código.
- 📍 #335 · `AddDealForm.vue` (Low).

**F14.5 — No envíes query params con `undefined`/`null`.**
- ❌ `convertToSnakeCase(options)` incluye claves con `undefined`/`null`, por lo que `qs.stringify` puede terminar enviando parámetros vacíos.
- ✅ Filtra las claves `undefined`/`null` antes de serializar.
- 📍 #339 · `contactService.ts` (Medium).

## F15. Filtros de autocomplete (Vuetify)

**Regla: un filtro custom que devuelve `0` cuando no hay match es interpretado por Vuetify como match en índice 0.**
- ❌ `accentInsensitiveFilter` devuelve `0` cuando no hay match (y también cuando `value`/`query` son `null`), lo que Vuetify interpreta como match en índice 0 → resalta texto incorrectamente y/o fuerza match en items que no contienen el término. Como los items ya vienen filtrados por el servidor, el efecto es más notorio.
- ✅ Devuelve `-1` (o el valor que Vuetify espera para "sin match") cuando no hay coincidencia; maneja `null` explícitamente.
- 📍 #339 · `@core/components/app-form-elements/AppAutocomplete.vue` (Medium).

## F16. Tests (frontend)

**F16.1 — Restaura los spies/mocks para no filtrarlos a otros tests.**
- ❌ El spy de `console.error` no se restaura, lo que puede filtrar el mock a tests posteriores.
- ✅ Restaura en `afterEach` (`vi.restoreAllMocks()` / `spy.mockRestore()`).
- 📍 #332 · `dealPaymentPlanSuggestion.spec.ts` (Low).

**F16.2 — El título del test debe describir el comportamiento que realmente valida.**
- ❌ El título del test contradice lo que valida: se espera que SÍ se emita `update:items` (aunque sea un no-op en contenido/orden), pero el título sugiere lo contrario → confunde al leer fallos o mantener el spec.
- ✅ Renombra el test para reflejar el comportamiento validado.
- 📍 #342 · `PaymentMethodDraggableList.spec.ts` (Low).

**F16.3 — Reordena las estructuras paralelas indexadas por posición junto con la lista principal.**
- ❌ Al reordenar solo se actualiza `paymentMethodsByTab`, pero `itemErrorsByTab` queda momentáneamente con el orden anterior. Como `PaymentMethodDraggableList` indexa errores por posición (`errors[idx]`), tras el drop/click pueden mostrarse errores asociados al ítem equivocado hasta que el `watch(paymentMethodsByTab, ...)` recalcula.
- ✅ Reordena el array de errores en el MISMO handler que reordena la lista, para no depender de un recálculo asíncrono.
- 📍 #342 · `AddPaymentPlanTemplateForm.vue` (Medium).

**F16.4 — Usa el mismo modelo de eventos para habilitar y limpiar (Pointer Events).**
- ❌ Se usa `useEventListener('pointerup'/'pointercancel', ...)` para limpiar el estado del drag, pero el grip habilita el drag con `@mousedown`. Inconsistencia de modelos de eventos; no soporta stylus/táctil.
- ✅ Usa `@pointerdown` en el grip (mismo modelo Pointer Events que el cleanup).
- 📍 #342 · `PaymentMethodDraggableList.vue` (Low).

---

# Checklist rápido pre-PR

**Backend**
- [ ] ¿El scoping por cuenta usa el MISMO criterio que las otras acciones del viewset? (`deal_units__unit__account`)
- [ ] ¿Validé IDs con `is not None` (no truthiness)? ¿Normalicé query params con `.strip()`?
- [ ] ¿Todo texto traducible tiene su `msgid` en `.po`? ¿Los mensajes son entity-agnósticos? ¿Pasé `context` a serializers anidados?
- [ ] ¿Expongo FK IDs vía `*_id` (no source anidado)? ¿No prefetcheo lo que no leo? ¿No invalido prefetch con re-queries? ¿`Count(distinct=True)` con joins?
- [ ] ¿Redondeo monetario con `ROUND_HALF_UP` explícito? ¿Preview y creación usan la misma fuente de exchange rate?
- [ ] ¿`order_by('position', 'pk')` en todos lados? ¿Bloqueo el padre en flujos concurrentes de position?
- [ ] ¿Detecto IntegrityError por `constraint_name` (no substring)?
- [ ] ¿`partial_update` NO borra colecciones omitidas? ¿El endpoint respeta su contrato declarado?
- [ ] ¿El backfill/migración no pisa datos custom ni asume estados de deploy rolling? ¿Seeder idempotente?
- [ ] ¿Type hints reflejan el tipo real? ¿Tests cubren el caso exacto del bug (incl. TZ con `tz_offset=0`)?

**Frontend**
- [ ] ¿Importé todo de `vue`? ¿Declaré como `ref` el estado usado en template?
- [ ] ¿Los tipos reflejan nullabilidad real? ¿Handlers tipan el payload completo del hijo? ¿Inicialicé con el tipo correcto?
- [ ] ¿Usé `??` (no `||`) donde `0`/`''` son válidos? ¿Comparé IDs contra `null` (no truthiness)?
- [ ] ¿Los composables relanzan o verifico su retorno? ¿Doy feedback de error? ¿Limpio `error` para reintentos?
- [ ] ¿Evité `Boolean(computedRef)`? ¿Forcé a boolean los computed con `&&`/`||`?
- [ ] ¿La key de caché firma unidades + descuentos + bono pie? ¿Invalido el plan aplicado al cambiar la key? ¿Preservo el plan manual?
- [ ] ¿Manejo race conditions con requestId/key? ¿Limpio resultados al iniciar/fallar búsqueda? ¿Valido `batchSize > 0`?
- [ ] ¿El diálogo ejecuta `closeDialog()` en ESC/clic-fuera? ¿Reseteo estado interno del autocomplete con `:key`?
- [ ] ¿Sincronizo TODOS los campos derivados al cambiar estado base? ¿El preview refleja los montos que se enviarán? ¿Bloqueo el avance ante fallos?
- [ ] ¿Respeto `inputDecimals`? ¿El ajuste por redondeo replica las reglas del backend (solo `appliesToDeed`, sin subsidio/fijos)?
- [ ] ¿SSR-safe (`useEventListener('event', ...)` sin `window`)? ¿Manejo multi-moneda? ¿Normalizo fechas inválidas antes de ordenar?
- [ ] ¿Eliminé código muerto/inalcanzable? ¿Comentarios veraces? ¿No envío query params `null`/`undefined`? ¿Restauro spies en tests?
