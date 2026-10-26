import { ComfyWorkflowGraph } from "../../src/types/workflow";

export const animaStickerGraph: ComfyWorkflowGraph = {
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
      "text": "",
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
  "3": {
    "inputs": {
      "unet_name": "anima.base.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "Load Diffusion Model"
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
      "seed": 707943841279101,
      "steps": 30,
      "cfg": 4,
      "sampler_name": "er_sde",
      "scheduler": "simple",
      "denoise": 1,
      "model": [
        "8",
        0
      ],
      "positive": [
        "2",
        0
      ],
      "negative": [
        "4",
        0
      ],
      "latent_image": [
        "7",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "KSampler"
    }
  },
  "7": {
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
  "8": {
    "inputs": {
      "lora_name": "silvana.safetensors",
      "strength_model": 1,
      "model": [
        "3",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "Load LoRA"
    }
  },
  "9": {
    "inputs": {
      "samples": [
        "6",
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
  "12": {
    "inputs": {
      "model": "RMBG-2.0",
      "sensitivity": 1,
      "process_res": 1024,
      "mask_blur": 0,
      "mask_offset": 0,
      "invert_output": false,
      "refine_foreground": false,
      "unload_model": false,
      "background": "Alpha",
      "background_color": "#222222",
      "image": [
        "9",
        0
      ]
    },
    "class_type": "RMBG",
    "_meta": {
      "title": "Remove Background (RMBG)"
    }
  },
  "13": {
    "inputs": {
      "width": 2,
      "color": "#FFFFFF",
      "image": [
        "12",
        0
      ]
    },
    "class_type": "OutlineAlphaSnap",
    "_meta": {
      "title": "Outline Alpha Snap"
    }
  },
  "14": {
    "inputs": {
      "filename_prefix": "Stickers",
      "images": [
        "13",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Save Image"
    }
  }
};
