import os
from dotenv import load_dotenv

# Load env variables from .env file using absolute path before imports
base_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(base_dir, '.env')
load_dotenv(dotenv_path)

from google import genai
from backend import create_app


print("[INFO] Connecting to Google servers... Please wait...")

try:
    # This checks your computer system directly for the key
    client = genai.Client()
    
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents='Say the word "Success" and nothing else.',
    )
    
    print("\n[GEMINI RESPONSE]")
    print(response.text)

except Exception as e:
    print("\n[ERROR] Something went wrong:")
    print(e)

# Instantiate the Flask app factory
app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"\n[INFO] Starting DeskAI Flask app on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=app.debug)

