from __future__ import annotations

from server.core.config import APP_SETTINGS_FILE
from server.image_providers.registry import get_model_catalog, get_provider_catalog
from server.settings.models import AppSettings, AppSettingsPublic, GeneralSettings, ImageSettings, ImageSettingsPublic, LlmSettings, LlmSettingsPublic
from server.storage.json_io import read_json, write_json


def normalize_llm_settings(data: dict | None) -> LlmSettings:
    incoming = data or {}
    settings = LlmSettings(**incoming)
    settings.hasApiKey = bool(settings.apiKey.strip())
    return settings


def normalize_image_settings(data: dict | None) -> ImageSettings:
    incoming = data or {}
    settings = ImageSettings(**incoming)
    provider = get_provider_catalog(settings.provider) or get_provider_catalog("geeknow")
    if provider:
        settings.provider = provider["id"]
        if not any(model["id"] == settings.model for model in provider["models"]):
            settings.model = provider["defaultModel"]
        model = get_model_catalog(settings.provider, settings.model)
        if model:
            settings.aspectRatio = settings.aspectRatio if settings.aspectRatio in model.get("aspectRatios", []) else model.get("defaultAspectRatio", settings.aspectRatio)
            image_sizes = model.get("imageSizes", [])
            if image_sizes:
                settings.imageSize = settings.imageSize if settings.imageSize in image_sizes else model.get("defaultImageSize", image_sizes[0])
            else:
                settings.imageSize = ""
            size_map = model.get("sizeMap") or {}
            if size_map:
                settings.size = size_map.get(settings.aspectRatio, model.get("defaultSize", settings.size))
            else:
                settings.size = model.get("defaultSize", settings.size)
            if not settings.baseUrl:
                settings.baseUrl = provider["baseUrls"][0]["url"]
            if settings.runtimeBaseUrl and not any(item.get("url") == settings.runtimeBaseUrl for item in provider.get("baseUrls", [])):
                settings.runtimeBaseUrl = ""
    settings.requestTimeout = max(30, min(int(settings.requestTimeout), 900))
    settings.downloadTimeout = max(30, min(int(settings.downloadTimeout), 900))
    settings.hasApiKey = bool(settings.apiKey.strip())
    return settings


def normalize_general_settings(data: dict | None) -> GeneralSettings:
    incoming = data or {}
    settings = GeneralSettings(**incoming)
    settings.imageConcurrency = max(1, min(int(settings.imageConcurrency), 8))
    return settings


def get_settings() -> AppSettings:
    parsed = read_json(APP_SETTINGS_FILE, {})
    general = normalize_general_settings(parsed.get("general") if isinstance(parsed, dict) else {})
    llm = normalize_llm_settings(parsed.get("llm") if isinstance(parsed, dict) else {})
    image = normalize_image_settings(parsed.get("image") if isinstance(parsed, dict) else {})
    return AppSettings(general=general, llm=llm, image=image)


def write_settings(settings: AppSettings) -> None:
    write_json(APP_SETTINGS_FILE, {
        "general": settings.general.model_dump(),
        "llm": settings.llm.model_dump(),
        "image": settings.image.model_dump(),
    })


def save_llm_settings(data: dict) -> AppSettingsPublic:
    current = get_settings()
    incoming = {**current.llm.model_dump(), **data}
    if "apiKey" not in data and current.llm.apiKey:
        incoming["apiKey"] = current.llm.apiKey
    llm = normalize_llm_settings(incoming)
    next_settings = AppSettings(general=current.general, llm=llm, image=current.image)
    write_settings(next_settings)
    return public_settings(next_settings)


def save_image_settings(data: dict) -> AppSettingsPublic:
    current = get_settings()
    incoming = {**current.image.model_dump(), **data}
    if "apiKey" not in data and current.image.apiKey:
        incoming["apiKey"] = current.image.apiKey
    image = normalize_image_settings(incoming)
    next_settings = AppSettings(general=current.general, llm=current.llm, image=image)
    write_settings(next_settings)
    return public_settings(next_settings)


def save_general_settings(data: dict) -> AppSettingsPublic:
    current = get_settings()
    general = normalize_general_settings({**current.general.model_dump(), **data})
    next_settings = AppSettings(general=general, llm=current.llm, image=current.image)
    write_settings(next_settings)
    return public_settings(next_settings)


def public_settings(settings: AppSettings | None = None) -> AppSettingsPublic:
    current = settings or get_settings()
    return AppSettingsPublic(
        general=current.general,
        llm=LlmSettingsPublic(
            provider=current.llm.provider,
            model=current.llm.model,
            baseUrl=current.llm.baseUrl,
            hasApiKey=current.llm.hasApiKey,
            temperature=current.llm.temperature,
            jsonMode=current.llm.jsonMode,
        ),
        image=ImageSettingsPublic(
            provider=current.image.provider,
            model=current.image.model,
            baseUrl=current.image.baseUrl,
            runtimeBaseUrl=current.image.runtimeBaseUrl,
            hasApiKey=current.image.hasApiKey,
            aspectRatio=current.image.aspectRatio,
            imageSize=current.image.imageSize,
            size=current.image.size,
            requestTimeout=current.image.requestTimeout,
            downloadTimeout=current.image.downloadTimeout,
        ),
    )


def get_llm_api_key() -> str:
    return get_settings().llm.apiKey


def get_image_api_key() -> str:
    return get_settings().image.apiKey
