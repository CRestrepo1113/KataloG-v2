import base64
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings


import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background warm-up task: let Uvicorn open port first, then warm up AI engine in background
    async def warmup():
        await asyncio.sleep(2)
        try:
            from app.services.image_ai import get_rembg_and_session
            get_rembg_and_session()
            print("AI Rembg engine warmed up and preloaded in RAM successfully!")
        except Exception as e:
            print("Background warmup log:", e)

    asyncio.create_task(warmup())
    yield

app = FastAPI(
    title="KataloG AI Image Microservice",
    description="Microservicio de Procesamiento e IA para KYG DISTRIBUCIONES",
    version="1.0.0",
    lifespan=lifespan
)


# Parse allowed origins
raw_origins = settings.ALLOWED_ORIGINS
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()] if raw_origins != "*" else ["*"]

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_api_key(x_api_key: str = Header(None)):
    """Verifies X-API-Key header if BACKEND_API_KEY is configured in production."""
    if settings.BACKEND_API_KEY:
        if not x_api_key or x_api_key != settings.BACKEND_API_KEY:
            raise HTTPException(
                status_code=401,
                detail="Acceso no autorizado: X-API-Key inválida o ausente."
            )
    return True

@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "app": "KataloG AI Backend",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }

@app.post("/api/v1/process-image")
def process_image_endpoint(
    file: UploadFile = File(...),
    _: bool = Depends(verify_api_key)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo enviado debe ser una imagen válida.")

    try:
        from app.services.image_ai import process_product_image
        contents = file.file.read()
        processed_webp_bytes = process_product_image(contents)
        base64_encoded = base64.b64encode(processed_webp_bytes).decode("utf-8")

        return JSONResponse(content={
            "success": True,
            "format": "webp",
            "dataUrl": f"data:image/webp;base64,{base64_encoded}"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando la imagen: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

