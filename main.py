import base64
import json
import logging
import math
import os
import re
import time
from typing import Optional, Tuple

import pandas as pd
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from groq import Groq

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = """\
Ты — аналитик экосистемы Freedom (Broker, Bank, Insurance). \
Все обращения нужно рассматривать только с точки зрения финансовых и инвестиционных услуг.

Ты работаешь в системе Freedom Intelligent Routing Engine (FIRE). \
Твоя задача — анализировать входящие обращения клиентов и возвращать строго структурированный JSON.

КАТЕГОРИИ (field: type):
- Жалоба
- Смена данных
- Консультация
- Претензия
- Неработоспособность приложения
- Мошеннические действия
- Спам

ПРАВИЛА:
1. Тональность (field: sentiment) определяется ИСКЛЮЧИТЕЛЬНО по эмоциональному тону клиента, а НЕ по серьёзности или сути проблемы:
   - Позитивный: благодарность, похвала, довольство.
   - Нейтральный: вежливое описание проблемы без эмоций, простой запрос, просьба о помощи.
   - Негативный: ТОЛЬКО если есть явное раздражение, угрозы, ругань, оскорбления, агрессивные требования.
   ВАЖНО:
   - Серьёзность проблемы (блокировка, мошенничество, потеря денег) НЕ влияет на тональность. \
Если клиент вежливо описывает серьёзную проблему — это Нейтральный.
   - Срочность ("срочно", "быстро", "в течение N минут") сама по себе НЕ делает тональность негативной.
   - "Добрый день/вечер", "прошу помочь", "с уважением" — маркеры Нейтрального тона.
   - Негативный ставь ТОЛЬКО при наличии явной агрессии, угроз или оскорблений в тексте.
2. Приоритет (field: priority): целое число от 1 до 10.
3. Язык (field: language): KZ, ENG, RU. По умолчанию RU.
4. Summary (field: summary): 1-2 предложения сути + рекомендация для менеджера. ЯЗЫК summary ДОЛЖЕН совпадать с полем language: если language=ENG — пиши summary на английском, если KZ — на казахском, если RU — на русском.
5. ФОРМАТ ОТВЕТА: Только валидный JSON. Никакого лишнего текста.
6. Оффтопик: если запрос не относится к финансовым услугам (например, личные просьбы, \
бытовые темы, реклама сторонних товаров), классифицируй его как "Консультация", \
ставь priority: 1 и в summary пиши, что запрос не относится к деятельности компании.

Пример JSON:
{
  "type": "Жалоба",
  "sentiment": "Негативный",
  "priority": 8,
  "language": "RU",
  "summary": "Клиент не может войти в приложение после обновления. Рекомендуется сбросить кэш и проверить версию ОС."
}
"""

MAX_RETRIES = 3

FALLBACK_OFFICES = ["Астана", "Алматы"]

_geocoder = Nominatim(user_agent="fire_geocoder")

# ─────────────────────────────────────────────
# 1. AI-анализ текста (+ Vision)
# ─────────────────────────────────────────────

MODEL_TEXT = "llama-3.3-70b-versatile"
MODEL_VISION = "meta-llama/llama-4-scout-17b-16e-instruct"


def encode_image_base64(image_path: str) -> str:
    """Читает файл изображения и возвращает его содержимое в формате base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def analyze(
    text: Optional[str] = None,
    image_path: Optional[str] = None,
) -> dict:
    """Анализирует обращение клиента через Groq.

    - Только текст → llama-3.3-70b-versatile.
    - Есть изображение (с текстом или без) → llama-3.2-11b-vision-preview.
    - Нет ни текста, ни изображения → дефолтный ответ.

    Если API вернул невалидный JSON, делает повторный запрос (до MAX_RETRIES попыток).
    """
    has_text = text and str(text).strip() not in ("", "nan")
    has_image = image_path and os.path.isfile(image_path)

    if not has_text and not has_image:
        return {
            "type": "Консультация",
            "sentiment": "Нейтральный",
            "priority": 1,
            "language": "RU",
            "summary": "Текст обращения отсутствует. Рекомендуется связаться с клиентом для уточнения.",
        }

    # --- Выбор модели и формирование сообщения ---
    if has_image:
        model = MODEL_VISION
        b64 = encode_image_base64(image_path)
        ext = os.path.splitext(image_path)[1].lstrip(".").lower()
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")

        content_parts = []
        if has_text:
            content_parts.append({
                "type": "text",
                "text": f"Текст обращения: {text}. Проанализируй это вместе с приложенным изображением.",
            })
        else:
            content_parts.append({
                "type": "text",
                "text": "Проанализируй приложенное изображение как обращение клиента.",
            })
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}"},
        })
        user_message = content_parts
    else:
        model = MODEL_TEXT
        user_message = str(text)

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0,
            }
            if not has_image:
                kwargs["response_format"] = {"type": "json_object"}

            chat_completion = client.chat.completions.create(**kwargs)
            raw = chat_completion.choices[0].message.content
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            # Попытка извлечь JSON из текста (vision-модель может обернуть его в markdown)
            if raw:
                m = re.search(r'\{[^{}]*"type"[^{}]*\}', raw, re.DOTALL)
                if m:
                    try:
                        return json.loads(m.group())
                    except json.JSONDecodeError:
                        pass
            last_error = exc
            logger.warning(
                "Попытка %d/%d: API вернул невалидный JSON — %s | raw=%s",
                attempt, MAX_RETRIES, exc, repr(raw[:300]) if raw else "<empty>",
            )
        except Exception as exc:
            last_error = exc
            logger.error(
                "Попытка %d/%d: ошибка при вызове API — %s",
                attempt, MAX_RETRIES, exc,
            )

    raise RuntimeError(
        f"Не удалось получить валидный JSON после {MAX_RETRIES} попыток. "
        f"Последняя ошибка: {last_error}"
    )


# ─────────────────────────────────────────────
# 2. Геокодинг
# ─────────────────────────────────────────────

def geocode(
    country: str,
    city: str,
    street: str = "",
    house: str = "",
) -> Optional[Tuple[float, float]]:
    """Возвращает (latitude, longitude) по адресу или None, если адрес не найден."""
    # Очищаем составные названия вроде "Косшы / Астана" → "Косшы"
    if city and "/" in str(city):
        city = str(city).split("/")[0].strip()
    parts = [p for p in (house, street, city, country) if p and str(p).lower() != "nan"]
    if not parts:
        return None
    address = ", ".join(parts)

    try:
        location = _geocoder.geocode(address, timeout=10)
    except (GeocoderTimedOut, GeocoderServiceError) as exc:
        logger.error("Ошибка геокодинга: %s", exc)
        return None

    if location is None:
        # Попробуем только город + страна
        fallback = ", ".join(p for p in (city, country) if p and str(p).lower() != "nan")
        if fallback != address:
            try:
                location = _geocoder.geocode(fallback, timeout=10)
            except (GeocoderTimedOut, GeocoderServiceError):
                pass
    if location is None:
        logger.info("Адрес не найден: %s", address)
        return None

    return (location.latitude, location.longitude)


UNITS_CACHE_FILE = "units_coords_cache.json"


def geocode_units(units_df: pd.DataFrame) -> pd.DataFrame:
    """Геокодирует адреса офисов. Результат кешируется в JSON-файл.

    При повторных запусках координаты читаются из кеша мгновенно.
    Если кеш устарел или отсутствует — геокодирует заново и сохраняет.
    """
    # --- Попытка загрузить кеш ---
    if os.path.isfile(UNITS_CACHE_FILE):
        with open(UNITS_CACHE_FILE, "r", encoding="utf-8") as f:
            cache: dict = json.load(f)
        # Проверяем, что все офисы из DataFrame есть в кеше
        all_cached = all(row["Офис"] in cache for _, row in units_df.iterrows())
        if all_cached:
            logger.info("Координаты офисов загружены из кеша (%s).", UNITS_CACHE_FILE)
            units_df = units_df.copy()
            units_df["unit_lat"] = units_df["Офис"].map(lambda o: cache[o][0])
            units_df["unit_lon"] = units_df["Офис"].map(lambda o: cache[o][1])
            return units_df

    # --- Геокодинг (первый запуск или кеш неполный) ---
    logger.info("Геокодинг офисов (результат будет закеширован)...")
    cache = {}
    lats, lons = [], []
    for _, row in units_df.iterrows():
        office = row["Офис"]
        address = row["Адрес"]
        coords = geocode(country="Казахстан", city=office, street=address)
        if coords:
            lats.append(coords[0])
            lons.append(coords[1])
            cache[office] = [coords[0], coords[1]]
        else:
            logger.warning("Не удалось геокодировать офис: %s — %s", office, address)
            lats.append(None)
            lons.append(None)
            cache[office] = [None, None]
        time.sleep(1)

    # --- Сохраняем кеш ---
    with open(UNITS_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    logger.info("Кеш координат офисов сохранён в %s.", UNITS_CACHE_FILE)

    units_df = units_df.copy()
    units_df["unit_lat"] = lats
    units_df["unit_lon"] = lons
    return units_df


# ─────────────────────────────────────────────
# 3. Поиск ближайшего офиса
# ─────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние между двумя точками в км (формула Гаверсинуса)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


_fallback_toggle = 0  # для чередования 50/50 Астана/Алматы


def get_nearest_unit(
    client_lat: Optional[float],
    client_lon: Optional[float],
    units_df: pd.DataFrame,
    client_country: str = "",
) -> str:
    """Возвращает название ближайшего офиса.

    Если координаты клиента неизвестны или клиент за рубежом —
    чередуем Астана / Алматы (50/50).
    """
    global _fallback_toggle

    is_foreign = (
        client_country
        and str(client_country).lower() not in ("казахстан", "kazakhstan", "kz", "nan", "")
    )

    if client_lat is None or client_lon is None or is_foreign:
        office = FALLBACK_OFFICES[_fallback_toggle % 2]
        _fallback_toggle += 1
        logger.info("Fallback распределение → %s", office)
        return office

    valid = units_df.dropna(subset=["unit_lat", "unit_lon"])
    if valid.empty:
        office = FALLBACK_OFFICES[_fallback_toggle % 2]
        _fallback_toggle += 1
        return office

    distances = valid.apply(
        lambda r: _haversine(client_lat, client_lon, r["unit_lat"], r["unit_lon"]),
        axis=1,
    )
    nearest_idx = distances.idxmin()
    return valid.loc[nearest_idx, "Офис"]


# ─────────────────────────────────────────────
# 4. Назначение менеджера (бизнес-правила)
# ─────────────────────────────────────────────

_round_robin_state: dict = {}  # ключ = (office, frozenset(filter_key)) → int


def _filter_managers(
    managers_df: pd.DataFrame,
    office: str,
    client_segment: str,
    ticket_type: Optional[str],
    lang: str,
) -> pd.DataFrame:
    """Применяет каскад фильтров к менеджерам одного офиса."""
    pool = managers_df[managers_df["Офис"] == office].copy()
    if pool.empty:
        return pool

    segment_upper = str(client_segment).strip().upper()
    if segment_upper in ("VIP", "PRIORITY"):
        pool = pool[pool["Навыки"].str.contains("VIP", case=False, na=False)]

    if ticket_type and ticket_type.strip().lower() == "смена данных":
        pool = pool[pool["Должность"].str.strip().str.lower() == "главный специалист"]

    if lang == "KZ":
        pool = pool[pool["Навыки"].str.contains("KZ", case=False, na=False)]
    elif lang == "ENG":
        pool = pool[pool["Навыки"].str.contains("ENG", case=False, na=False)]

    return pool


def assign_manager(
    ticket_type: Optional[str],
    ticket_language: Optional[str],
    client_segment: str,
    nearest_office: str,
    managers_df: pd.DataFrame,
    units_df: pd.DataFrame = None,
    client_lat: float = None,
    client_lon: float = None,
) -> Optional[str]:
    """Назначает менеджера по каскаду фильтров из ТЗ.

    Если в ближайшем офисе нет подходящих менеджеров — ищет в следующем
    ближайшем офисе, и так далее.

    Возвращает ФИО менеджера или None, если подходящий не найден.
    """
    lang = str(ticket_language).strip().upper() if ticket_language else "RU"
    segment_upper = str(client_segment).strip().upper()

    # Собираем список офисов по удалённости
    offices_to_try = [nearest_office]
    if units_df is not None and client_lat is not None and client_lon is not None:
        valid = units_df.dropna(subset=["unit_lat", "unit_lon"])
        if not valid.empty:
            distances = valid.apply(
                lambda r: _haversine(client_lat, client_lon, r["unit_lat"], r["unit_lon"]),
                axis=1,
            )
            sorted_offices = valid.loc[distances.sort_values().index, "Офис"].tolist()
            for o in sorted_offices:
                if o not in offices_to_try:
                    offices_to_try.append(o)
    # Добавляем все оставшиеся офисы (на случай если units_df не передан)
    all_offices = managers_df["Офис"].unique().tolist()
    for o in all_offices:
        if o not in offices_to_try:
            offices_to_try.append(o)

    for office in offices_to_try:
        pool = _filter_managers(managers_df, office, client_segment, ticket_type, lang)
        if pool.empty:
            continue

        if office != nearest_office:
            logger.info(
                "Нет подходящих менеджеров в %s, назначаем из %s",
                nearest_office, office,
            )

        # --- Балансировка: 2 менеджера с наименьшей нагрузкой, Round Robin ---
        pool = pool.sort_values("Количество обращений в работе")
        top2 = pool.head(2)

        rr_key = (office, segment_upper, str(ticket_type), lang)
        idx = _round_robin_state.get(rr_key, 0)
        chosen_pos = idx % len(top2)
        _round_robin_state[rr_key] = idx + 1

        chosen = top2.iloc[chosen_pos]
        chosen_name = chosen["ФИО"]

        # Увеличиваем нагрузку в исходном DataFrame
        real_idx = chosen.name
        managers_df.at[real_idx, "Количество обращений в работе"] += 1

        return chosen_name

    logger.warning(
        "Нет подходящих менеджеров ни в одном офисе (тип=%s, язык=%s, сегмент=%s)",
        ticket_type, lang, client_segment,
    )
    return None


# ─────────────────────────────────────────────
# 5. Полный pipeline обработки тикетов
# ─────────────────────────────────────────────

def process_all_tickets(
    tickets_path: str = "tickets.csv",
    managers_path: str = "managers.csv",
    units_path: str = "business_units.csv",
    output_path: str = "final_results.csv",
) -> pd.DataFrame:
    """Полный pipeline FIRE: AI-анализ → геокодинг → ближайший офис → назначение менеджера."""

    # --- Загрузка данных ---
    tickets_df = pd.read_csv(tickets_path)
    managers_df = pd.read_csv(managers_path)
    units_df = pd.read_csv(units_path)

    # Нормализуем имена колонок менеджеров (убираем лишние пробелы)
    managers_df.columns = managers_df.columns.str.strip()

    logger.info("Загружено: %d тикетов, %d менеджеров, %d офисов",
                len(tickets_df), len(managers_df), len(units_df))

    # --- Геокодинг офисов ---
    logger.info("Геокодинг офисов...")
    units_df = geocode_units(units_df)
    logger.info("Офисы геокодированы:\n%s",
                units_df[["Офис", "unit_lat", "unit_lon"]].to_string(index=False))

    # --- Обработка каждого тикета ---
    results = []
    total = len(tickets_df)

    for idx, row in tickets_df.iterrows():
        logger.info("═══ Тикет %d/%d ═══", idx + 1, total)

        # 1) AI-анализ
        description = str(row.get("Описание ", row.get("Описание", "")))
        attachment = str(row.get("Вложения", "")).strip()

        # Определяем image_path если вложение — файл изображения
        img_path = None
        if attachment and attachment.lower() != "nan":
            candidate = os.path.join(os.path.dirname(tickets_path), attachment)
            if os.path.isfile(candidate):
                img_path = candidate
            else:
                logger.info("Тикет %d: файл вложения не найден — %s", idx + 1, candidate)

        # Если описание пустое/nan, передаём text=None
        text_val = description if description.strip() not in ("", "nan") else None

        try:
            analysis = analyze(text=text_val, image_path=img_path)
        except RuntimeError as exc:
            logger.error("Тикет %d: AI-ошибка — %s", idx + 1, exc)
            analysis = {
                "type": None, "sentiment": None,
                "priority": None, "language": None,
                "summary": str(exc),
            }

        # Спам — сохраняем для аналитики, но не назначаем менеджера
        if analysis.get("type") == "Спам":
            logger.info("Тикет %d: Спам — пропускаем назначение.", idx + 1)
            client_lat = client_lon = None
            nearest_office = None
            assigned = None
        else:
            # 2) Геокодинг клиента
            coords = geocode(
                country=str(row.get("Страна", "")),
                city=str(row.get("Населённый пункт", "")),
                street=str(row.get("Улица", "")),
                house=str(row.get("Дом", "")),
            )
            client_lat = coords[0] if coords else None
            client_lon = coords[1] if coords else None

            # 3) Ближайший офис
            nearest_office = get_nearest_unit(
                client_lat, client_lon, units_df,
                client_country=str(row.get("Страна", "")),
            )

            # 4) Назначение менеджера
            assigned = assign_manager(
                ticket_type=analysis.get("type"),
                ticket_language=analysis.get("language"),
                client_segment=str(row.get("Сегмент клиента", "")),
                nearest_office=nearest_office,
                managers_df=managers_df,
                units_df=units_df,
                client_lat=client_lat,
                client_lon=client_lon,
            )

        results.append({
            "GUID клиента": row.get("GUID клиента"),
            "Сегмент клиента": row.get("Сегмент клиента"),
            "Описание": description[:120] + "..." if len(description) > 120 else description,
            "ai_type": analysis.get("type"),
            "ai_sentiment": analysis.get("sentiment"),
            "ai_priority": analysis.get("priority"),
            "ai_language": analysis.get("language"),
            "ai_summary": analysis.get("summary"),
            "client_lat": client_lat,
            "client_lon": client_lon,
            "nearest_office": nearest_office,
            "assigned_manager": assigned,
        })

        time.sleep(1)

    result_df = pd.DataFrame(results)
    result_df.to_csv(output_path, index=False, encoding="utf-8-sig")
    logger.info("Результат сохранён в %s", output_path)
    return result_df


# ─────────────────────────────────────────────
# 6. Точка входа
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=== FIRE — Freedom Intelligent Routing Engine ===")
    print("Режимы: [1] Интерактивный  [2] Обработка CSV (полный pipeline)")
    mode = input("Выберите режим (1/2): ").strip()

    if mode == "2":
        result_df = process_all_tickets()
        print(f"\nОбработано тикетов: {len(result_df)}")
        print(result_df[["GUID клиента", "ai_type", "ai_priority",
                         "nearest_office", "assigned_manager"]].to_string(index=False))
    else:
        # --- Для интерактивного режима загружаем офисы и менеджеров ---
        mgr_df = pd.read_csv("managers.csv")
        mgr_df.columns = mgr_df.columns.str.strip()
        units_df = pd.read_csv("business_units.csv")
        print("Геокодинг офисов (один раз)...")
        units_df = geocode_units(units_df)

        print("Введите обращение клиента (или 'exit' для выхода):\n")

        while True:
            user_input = input("> ").strip()
            if not user_input or user_input.lower() == "exit":
                break

            # --- Опциональное изображение ---
            img = input("  Путь к изображению (Enter — пропустить): ").strip() or None

            # --- AI-анализ ---
            try:
                result = analyze(text=user_input, image_path=img)
                print("\n--- Результат анализа ---")
                print(json.dumps(result, ensure_ascii=False, indent=2))
            except RuntimeError as err:
                print(f"Ошибка анализа: {err}")
                continue

            # Спам — сохраняем для аналитики, но не назначаем менеджера
            if result.get("type") == "Спам":
                print("  → Спам. Менеджер не назначается.")
                print()
                continue

            # --- Адрес клиента ---
            print("\n--- Введите адрес клиента ---")
            country = input("  Страна:  ").strip()
            city    = input("  Город:   ").strip()
            street  = input("  Улица:   ").strip()
            house   = input("  Дом:     ").strip()
            segment = input("  Сегмент (Mass/VIP/Priority): ").strip()

            coords = geocode(country, city, street, house)
            if coords:
                print(f"  Координаты: {coords[0]:.6f}, {coords[1]:.6f}")
            else:
                print("  Координаты не определены.")

            # --- Ближайший офис ---
            office = get_nearest_unit(
                coords[0] if coords else None,
                coords[1] if coords else None,
                units_df,
                client_country=country,
            )
            print(f"  Ближайший офис: {office}")

            # --- Назначение менеджера ---
            manager = assign_manager(
                ticket_type=result.get("type"),
                ticket_language=result.get("language"),
                client_segment=segment or "Mass",
                nearest_office=office,
                managers_df=mgr_df,
                units_df=units_df,
                client_lat=coords[0] if coords else None,
                client_lon=coords[1] if coords else None,
            )
            print(f"  Назначенный менеджер: {manager or 'Не найден'}")
            print()
