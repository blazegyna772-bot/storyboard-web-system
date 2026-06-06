from __future__ import annotations

from pydantic import BaseModel


class LlmSettings(BaseModel):
    provider: str = "deepseek"
    model: str = "deepseek-chat"
    baseUrl: str = "https://api.deepseek.com"
    apiKey: str = ""
    hasApiKey: bool = False
    temperature: float = 0.2
    jsonMode: bool = True


class LlmSettingsPublic(BaseModel):
    provider: str = "deepseek"
    model: str = "deepseek-chat"
    baseUrl: str = "https://api.deepseek.com"
    hasApiKey: bool = False
    temperature: float = 0.2
    jsonMode: bool = True


class ImageSettings(BaseModel):
    provider: str = "geeknow"
    baseUrl: str = "https://api.geeknow.ai"
    runtimeBaseUrl: str = ""
    apiKey: str = ""
    hasApiKey: bool = False
    model: str = "gemini-3.1-flash-image-preview"
    aspectRatio: str = "16:9"
    imageSize: str = "1K"
    size: str = "1920x1080"
    requestTimeout: int = 300
    downloadTimeout: int = 300


class ImageSettingsPublic(BaseModel):
    provider: str = "geeknow"
    baseUrl: str = "https://api.geeknow.ai"
    runtimeBaseUrl: str = ""
    hasApiKey: bool = False
    model: str = "gemini-3.1-flash-image-preview"
    aspectRatio: str = "16:9"
    imageSize: str = "1K"
    size: str = "1920x1080"
    requestTimeout: int = 300
    downloadTimeout: int = 300


class GeneralSettings(BaseModel):
    imageConcurrency: int = 2


class AppSettings(BaseModel):
    general: GeneralSettings = GeneralSettings()
    llm: LlmSettings = LlmSettings()
    image: ImageSettings = ImageSettings()


class AppSettingsPublic(BaseModel):
    general: GeneralSettings = GeneralSettings()
    llm: LlmSettingsPublic = LlmSettingsPublic()
    image: ImageSettingsPublic = ImageSettingsPublic()
