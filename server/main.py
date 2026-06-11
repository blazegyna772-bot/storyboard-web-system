from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.api.projects import router as projects_router
from server.api.rulepacks import router as rulepacks_router
from server.api.settings import router as settings_router
from server.api.logs import router as logs_router
from server.api.llm import router as llm_router
from server.api.system import router as system_router
from server.api.assets import router as assets_router
from server.api.story_workflow import router as story_workflow_router

app = FastAPI(title="Script Storyboard Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(rulepacks_router)
app.include_router(settings_router)
app.include_router(logs_router)
app.include_router(llm_router)
app.include_router(system_router)
app.include_router(assets_router)
app.include_router(story_workflow_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "script-storyboard-backend"}
