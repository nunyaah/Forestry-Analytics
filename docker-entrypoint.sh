#!/bin/bash
set -e

# tightvncserver requires USER to be set
export USER=$(whoami)
export HOME=/home/$USER

# Clean up any stale VNC lock files
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

# Start VNC server (listens on all interfaces by default)
tightvncserver :1 -geometry 1920x1080 -depth 24

# Start noVNC web interface on port 6080
websockify --web /usr/share/novnc/ 6080 localhost:5901 &

echo "QGIS desktop is accessible at http://localhost:6080/vnc.html"
echo "VNC password: qgis"

# Start QGIS inside the VNC session
DISPLAY=:1 xfce4-session &
sleep 3
DISPLAY=:1 qgis

# Keep container alive
wait
