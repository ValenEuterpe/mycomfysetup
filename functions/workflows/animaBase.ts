export const animaBaseGraph: Record<string, any> = {
  "1": {
    "inputs": {
      "clip_name": "qwen_3_06b_base.safetensors",
      "type": "stable_diffusion",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "Load CLIP"
    }
  },
  "2": {
    "inputs": {
      "unet_name": "anima.base.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "Load Diffusion Model"
    }
  },
  "3": {
    "inputs": {
      "text": "masterpiece, best quality, score_9, score_8, safe, @silvana, 1dog standing in the stree\n\n",
      "clip": [
        "1",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Prompt) Pos"
    }
  },
  "4": {
    "inputs": {
      "text": "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly, uncanny valley",
      "clip": [
        "1",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Prompt) Neg"
    }
  },
  "5": {
    "inputs": {
      "vae_name": "qwen_image_vae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "Load VAE"
    }
  },
  "6": {
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage",
    "_meta": {
      "title": "Empty Latent Image"
    }
  },
  "7": {
    "inputs": {
      "lora_name": "silvana.safetensors",
      "strength_model": 1,
      "model": [
        "2",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "Load LoRA"
    }
  },
  "8": {
    "inputs": {
      "seed": 155071897006192,
      "steps": 30,
      "cfg": 4,
      "sampler_name": "er_sde",
      "scheduler": "simple",
      "denoise": 1,
      "model": [
        "7",
        0
      ],
      "positive": [
        "3",
        0
      ],
      "negative": [
        "4",
        0
      ],
      "latent_image": [
        "6",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "KSampler"
    }
  },
  "9": {
    "inputs": {
      "samples": [
        "8",
        0
      ],
      "vae": [
        "5",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE Decode"
    }
  },
  "13": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": [
        "9",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Save Image"
    }
  }
};
