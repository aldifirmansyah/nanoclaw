---
name: image-gen
description: Generate images using Python (Pillow, matplotlib) and send them to the chat. Use when asked to draw, create charts, visualize data, or generate any image.
allowed-tools: Bash(python3:*), Bash(cat:*)
---

# Image Generation

You can generate images using Python (Pillow, matplotlib) and send them to the chat.

## How to generate and send an image

1. Write a Python script to generate the image and save it to `/workspace/group/generated.png`
2. Write an IPC message to send it

### Step 1: Generate the image

Example — simple graphic with Pillow:
```python
from PIL import Image, ImageDraw
img = Image.new('RGB', (800, 400), color='#1a1a2e')
draw = ImageDraw.Draw(img)
draw.text((40, 160), "Hello!", fill='white')
img.save('/workspace/group/generated.png')
```

Example — chart with matplotlib:
```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.bar(['A', 'B', 'C'], [10, 25, 15])
ax.set_title('My Chart')
plt.tight_layout()
plt.savefig('/workspace/group/generated.png', dpi=150)
plt.close()
```

Save the script to a file and run it:
```bash
python3 /workspace/group/gen_image.py
```

### Step 2: Send the image via IPC

```bash
cat > /workspace/ipc/messages/send-image-$(date +%s%N).json << 'EOF'
{
  "type": "image",
  "chatJid": "CHAT_JID_HERE",
  "imagePath": "/workspace/group/generated.png",
  "caption": "Here's your image!"
}
EOF
```

Replace `CHAT_JID_HERE` with the actual chat JID (available in your context as the source chat).

## Notes
- Save images to `/workspace/group/` — always use this path in both the Python script and the `imagePath` field
- The host automatically translates `/workspace/group/` to the correct host path
- Supported formats: PNG, JPEG, GIF
- Clean up old images after sending if they're no longer needed
