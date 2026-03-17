import sys
import json
import argparse
from faster_whisper import WhisperModel

def transcribe(audio_path, model_size, output_dir):
    # Run on CPU by default for maximum compatibility, use "cuda" if GPU is available
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
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
