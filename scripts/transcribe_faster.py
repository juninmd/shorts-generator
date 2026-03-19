import sys
import json
import argparse
def transcribe(audio_path, model_size, output_dir):
    # Lazy imports to avoid fatal crashes during script startup
    import os
    try:
        from faster_whisper import WhisperModel
        import ctranslate2
    except ImportError as e:
        print(f"Error importing faster-whisper: {e}", file=sys.stderr)
        sys.exit(1)

    # Default to CPU for maximum stability (prevents fatal DLL crashes on local machines)
    use_gpu = os.environ.get("WHISPER_USE_GPU", "false").lower() == "true"
    
    device = "cpu"
    if use_gpu:
        try:
            if ctranslate2.get_cuda_device_count() > 0:
                device = "cuda"
            else:
                print("GPU requested (WHISPER_USE_GPU=true) but no CUDA device found. Using CPU.")
        except Exception as e:
            print(f"GPU detection failed: {e}. Falling back to CPU.")
            device = "cpu"
            
    compute_type = "float16" if device == "cuda" else "int8"
    
    print(f"Starting transcription on device: {device} (compute_type: {compute_type})")
    
    model = None
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except:
        if device == "cuda":
            import traceback
            print("GPU initialization failed (DLL missing or incompatible).")
            traceback.print_exc()
            print("Falling back to CPU...")
            try:
                model = WhisperModel(model_size, device="cpu", compute_type="int8")
            except Exception as e:
                print(f"CPU fallback also failed: {e}")
                sys.exit(1)
        else:
            import traceback
            traceback.print_exc()
            sys.exit(1)

    if model is None:
        print("Failed to initialize Whisper model.")
        sys.exit(1)
    
    segments, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
    
    result = {
        "text": "",
        "language": info.language,
        "segments": []
    }
    
    full_text = []
    
    for segment in segments:
        seg_dict = {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "words": []
        }
        
        if segment.words:
            for word in segment.words:
                seg_dict["words"].append({
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability
                })
        
        result["segments"].append(seg_dict)
        full_text.append(segment.text)
    
    result["text"] = "".join(full_text).strip()
    
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path")
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--output_dir", required=True)
    args = parser.parse_args()
    
    try:
        data = transcribe(args.audio_path, args.model, args.output_dir)
        
        import os
        audio_basename = os.path.splitext(os.path.basename(args.audio_path))[0]
        output_path = os.path.join(args.output_dir, f"{audio_basename}.json")
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"Transcription saved to {output_path}")
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
