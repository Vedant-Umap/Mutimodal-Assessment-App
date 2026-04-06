import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import speech_recognition as sr
import imageio_ffmpeg
import pickle
from sentence_transformers import SentenceTransformer, util
import torch

# Add FFmpeg to PATH for pydub to auto-detect
os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
import io
import json
import cv2
import numpy as np
import tempfile
import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences
import base64

app = FastAPI()

class PatchedDense(tf.keras.layers.Dense):
    def __init__(self, *args, **kwargs):
        kwargs.pop("quantization_config", None)
        super().__init__(*args, **kwargs)

# Model paths - Search in environment variable, parent dir, or current dir
MODEL_DIR = os.getenv("MODEL_DIR")
if not MODEL_DIR:
    # Try looking for model_training in parent (local) or current (if moved)
    base_dir = os.path.dirname(os.path.dirname(__file__))
    potential_path = os.path.join(base_dir, "model_training")
    if os.path.exists(potential_path):
        MODEL_DIR = potential_path
    else:
        MODEL_DIR = os.path.join(os.path.dirname(__file__), "model_training")

emotion_path = os.path.join(MODEL_DIR, "t4_emotion_model.h5")
sentiment_path = os.path.join(MODEL_DIR, "best_model.keras")
tokenizer_path = os.path.join(MODEL_DIR, "tokenizer.pkl")

try:
    if os.path.exists(emotion_path):
        emotion_model = tf.keras.models.load_model(emotion_path, compile=False, custom_objects={"Dense": PatchedDense})
        print("Emotion model loaded.")
    else:
        print(f"Emotion model not found at {emotion_path}")
        emotion_model = None
except Exception as e:
    print(f"Error loading emotion model: {e}")
    emotion_model = None

try:
    if os.path.exists(tokenizer_path) and os.path.exists(sentiment_path):
        with open(tokenizer_path, "rb") as f:
            tokenizer = pickle.load(f)
        sentiment_model = tf.keras.models.load_model(sentiment_path, compile=False)
        print("Sentiment model/tokenizer loaded.")
    else:
        print(f"Sentiment files not found in {MODEL_DIR}")
        sentiment_model = None
        tokenizer = None
except Exception as e:
    print(f"Error loading sentiment model: {e}")
    sentiment_model = None
    tokenizer = None

try:
    print("Loading lightweight BERT (all-MiniLM-L6-v2)...")
    bert_model = SentenceTransformer('all-MiniLM-L6-v2')
    print("BERT model ready.")
except Exception as e:
    print(f"Error loading BERT model: {e}")
    bert_model = None

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
EMOTION_LABELS = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/api/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Strip prefix from base64 string
            if "," in data:
                b64_data = data.split(",")[1]
            else:
                b64_data = data
                
            img_bytes = base64.b64decode(b64_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is not None and emotion_model is not None:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                
                if len(faces) > 0:
                    (x, y, w, h) = faces[0]
                    face_roi = gray[y:y+h, x:x+w]
                    face_resized = cv2.resize(face_roi, (48, 48))
                    face_normalized = face_resized / 255.0
                    face_expanded = np.expand_dims(np.expand_dims(face_normalized, -1), 0)
                    
                    preds = emotion_model.predict(face_expanded, verbose=0)[0]
                    dominant_idx = int(np.argmax(preds))
                    dominant_emotion = EMOTION_LABELS[dominant_idx]
                    
                    scores = {label: float(preds[idx]) for idx, label in enumerate(EMOTION_LABELS)}
                    
                    await websocket.send_json({"status": "success", "dominant": dominant_emotion, "scores": scores})
                else:
                    await websocket.send_json({"status": "no_face"})
            else:
                await websocket.send_json({"status": "error_decode"})
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"status": "error", "detail": str(e)})

@app.post("/api/analyze")
async def analyze_video(
    audio: UploadFile = File(...),
    visualData: str = Form(...),
    transcript: str = Form(""),
    prompt: str = Form("Describe a personal achievement and how you overcame obstacles to reach it."),
    expected_answer: str = Form("One of my most meaningful achievements was successfully leading a project during a time when our team was facing tight deadlines and unexpected technical challenges. Initially, we encountered issues with system integration, which caused delays and affected team morale. Instead of reacting impulsively, I took a step back to analyze the problem and understand each team member’s perspective. I organized short daily check-ins to improve communication and ensured that everyone clearly understood their responsibilities. I also broke down the larger problem into smaller, manageable tasks, which made it easier to track progress and identify bottlenecks early. During this process, I made sure to remain approachable and encouraged open discussion, so team members felt comfortable sharing concerns or suggestions. Despite the pressure, I maintained a solution-oriented mindset and adapted our approach whenever necessary. Gradually, the team regained confidence, and we were able to resolve the technical issues and complete the project successfully within the revised timeline. This experience taught me the importance of clear communication, teamwork, and staying calm under pressure. It also strengthened my ability to handle challenges systematically and lead with empathy and accountability.")
):
    try:
        visual_stats = json.loads(visualData)
    except Exception as e:
        visual_stats = {}
    
    text = transcript.strip()
    error_msg = None
    
    audio_data = await audio.read()
    
    # Process emotion from video
    emotions_aggregated = {"happy": 0.0, "neutral": 0.0, "sad": 0.0, "angry": 0.0, "disgust": 0.0, "fear": 0.0, "surprise": 0.0}
    emotion_counts = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_video:
        temp_video.write(audio_data)
        temp_video_path = temp_video.name
        
    try:
        if emotion_model is not None:
            cap = cv2.VideoCapture(temp_video_path)
            frame_count = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                if frame_count % 10 == 0:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                    
                    if len(faces) > 0:
                        (x, y, w, h) = faces[0]
                        face_roi = gray[y:y+h, x:x+w]
                        face_resized = cv2.resize(face_roi, (48, 48))
                        face_normalized = face_resized / 255.0
                        face_expanded = np.expand_dims(np.expand_dims(face_normalized, -1), 0)
                        
                        preds = emotion_model.predict(face_expanded, verbose=0)[0]
                        for idx, label in enumerate(EMOTION_LABELS):
                            emotions_aggregated[label] += float(preds[idx])
                        emotion_counts += 1
                frame_count += 1
            cap.release()
            
        if emotion_counts > 0:
            for label in emotions_aggregated:
                emotions_aggregated[label] /= emotion_counts
            
            # Recalculate visual score
            happy_score = emotions_aggregated.get('happy', 0)
            neutral_score = emotions_aggregated.get('neutral', 0)
            visual_stats["overallVisualScore"] = (happy_score * 0.8 + neutral_score * 0.2) * 100
            visual_stats["emotions"] = emotions_aggregated
            
    except Exception as e:
        print(f"Error processing video frames: {e}")
    finally:
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
    
    # If frontend transcription failed, fallback to backend (which may fail without ffmpeg)
    if not text:
        recognizer = sr.Recognizer()
        try:
            with sr.AudioFile(io.BytesIO(audio_data)) as source:
                audio_content = recognizer.record(source)
                text = recognizer.recognize_google(audio_content)
        except Exception as e:
            error_msg = str(e)
            text = "No audio detected or audio format not readable without ffmpeg. Please ensure you spoke clearly during the practice session!"

    # Calculate sentiment (prob_pos 0-1)
    sentiment_scores = {"compound": 0.5, "pos": 0.5, "neu": 0.5, "neg": 0.0}
    
    if text and not text.startswith("No audio detected") and sentiment_model is not None and tokenizer is not None:
        try:
            sequences = tokenizer.texts_to_sequences([text])
            padded = pad_sequences(sequences, maxlen=100)
            prediction = sentiment_model.predict(padded, verbose=0)[0][0]
            
            prob_pos = float(prediction)
            prob_neg = 1.0 - prob_pos
            compound_score = (prob_pos - 0.5) * 2 
            
            sentiment_scores = {
                "compound": compound_score,
                "pos": prob_pos,
                "neu": 0.0,
                "neg": prob_neg
            }
        except Exception as e:
            print(f"Sentiment error: {e}")
    
    # BERT semantic comparison
    relevance_score = 0.5 
    if text and prompt and expected_answer and bert_model is not None:
        try:
            clean_text = text.replace("No audio detected: ", "")
            embeddings = bert_model.encode([prompt, expected_answer, clean_text], convert_to_tensor=True)
            
            prompt_emb, expected_emb, transcript_emb = embeddings[0], embeddings[1], embeddings[2]
            
            sim_prompt = float(util.cos_sim(transcript_emb, prompt_emb)[0][0])
            sim_expected = float(util.cos_sim(transcript_emb, expected_emb)[0][0])
            
            sim_prompt = max(0, min(1, sim_prompt))
            sim_expected = max(0, min(1, sim_expected))
            
            # Weighted: 70% Good Answer, 30% Topic relevance
            relevance_score = (sim_expected * 0.70) + (sim_prompt * 0.30)
        except Exception as e:
            print(f"BERT error: {e}")

    # Weights: Sentiment (30%), BERT (40%), Visual (30%)
    visual_confidence = visual_stats.get("overallVisualScore", 50)
    sentiment_value = (sentiment_scores.get("compound", 0) + 1) * 50
    semantic_value = relevance_score * 100
    
    overall_score = (sentiment_value * 0.3) + (semantic_value * 0.4) + (visual_confidence * 0.3)
    
    response = {
        "verbal": {
            "transcription": text,
            "sentiment": sentiment_scores,
            "relevance": relevance_score
        },
        "nonverbal": visual_stats.get("emotions", {"happy": 0.5, "neutral": 0.5}),
        "overall_performance_score": round(overall_score, 1)
    }
    
    return {"status": "success", "data": response, "error": error_msg}

@app.get("/")
def read_root():
    return {"message": "Multimodal Self-Assessment & Coaching API is running"}

# End of API
