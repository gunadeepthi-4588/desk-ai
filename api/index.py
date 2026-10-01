from backend import create_app

# Expose Flask app for Vercel serverless deployment
app = create_app()
