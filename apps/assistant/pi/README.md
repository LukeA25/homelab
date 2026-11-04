# Pi 3B nightstand client

The assistant **brain** runs on the homelab (`assistant.home.arpa`). The Pi:

1. Shows the control kiosk UI (`https://assistant.home.arpa/control`) in Chromium
2. Runs **openWakeWord** locally for hands-free wake (browser SpeechRecognition does not work on Pi Chromium)
3. Posts audio to `/api/turn` and plays the MP3 reply

Leave **Wake off** in the web UI so Chromium does not fight the Pi process for the mic. Use **Press to Talk** on screen as a backup.

## Wake word (openWakeWord)

No Picovoice account. Say **“hey jarvis”**, then the command.

Other built-in models: `alexa`, `hey_mycroft`, `hey_rhasspy` (`WAKE_WORD` in `wake.env`).

On the Pi:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip portaudio19-dev mpg123

mkdir -p ~/assistant-pi ~/assistant-venv ~/.config/homelab
python3 -m venv ~/assistant-venv
~/assistant-venv/bin/pip install -U pip
~/assistant-venv/bin/pip install -r ~/assistant-pi/requirements.txt
~/assistant-venv/bin/python -c "import openwakeword; openwakeword.utils.download_models()"

cp wake.env.example ~/.config/homelab/wake.env
nano ~/.config/homelab/wake.env   # ASSISTANT_DEVICE_TOKEN
chmod 600 ~/.config/homelab/wake.env

sudo cp homelab-wake.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now homelab-wake.service
journalctl -u homelab-wake.service -f
```

You should see `[wake] listening for 'hey_jarvis'`. Then: **hey jarvis, turn the bedroom lights off**.

Quiet hours default 23:00–07:00 America/Chicago.

## Kiosk (screen only)

```bash
chromium --kiosk https://assistant.home.arpa/control
```

Or `~/bin/kiosk.sh`. Prefer a solid 5V/2.5A+ PSU — this Pi has shown under-voltage (`throttled=0x50000`).
