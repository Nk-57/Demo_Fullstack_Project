from flask import Flask, jsonify
import requests

app = Flask(__name__)

@app.route('/weather/<city>')
def get_weather(city):
    # Proxy to wttr.in for python logic
    try:
        url = f"https://wttr.in/{city}?format=j1"
        response = requests.get(url)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Python Weather API running on port 5000")
    app.run(port=5000)