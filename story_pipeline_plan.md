# Automated AI Story & Video Pipeline Plan

## Overview
This plan outlines the architecture for a highly interactive, granular AI video generation pipeline. The system gives the user total creative control over the story and visual style, while autonomously handling the heavy lifting of video generation and background processing. 

The pipeline guarantees high-retention 60-second videos by breaking the process down into strict 8-10 second "Scene Clips".

---

## Phase 1: The "Director" Script Generation
1. **The Persona Prompt**: The worker injects a "Director" prompt into a fresh Gemini chat. This forces the AI to structure the story for maximum viewer retention without being boring.
2. **Interactive Brainstorming**: The user types their ideas and organically guides the story. The AI adapts seamlessly while maintaining a perfect 60-second pacing structure.
3. **The Blueprint**: Once the user types "Approve Script", the AI outputs the final script broken exactly into 6 chunks (for the six 8-10 second Veo clips), containing the exact visual prompts and voiceovers.

## Phase 2: Granular Reference Image Generation
1. **Scene-by-Scene Generation**: Instead of generating everything at once, the worker specifically asks Gemini to generate **2 to 3 reference images for Scene 1**.
2. **User Review UI**: The worker uploads these images to Supabase, and the frontend displays them.
3. **Accept or Modify**:
   - The user clicks **Modify**: The worker tells Gemini to adjust the images based on user feedback.
   - The user clicks **Accept**: The image for Scene 1 is locked in.
4. **Iterative Flow**: The system then generates reference images for Scene 2, repeating the approval loop until all 6 scenes have an approved reference image.

## Phase 3: Isolated Background Video Generation
1. **Separate Generation Chats**: To keep the main story chat clean and fast, clicking "Accept" on an image triggers a completely new background job. The worker opens a **brand new, separate chat** on the Gemini website dedicated strictly to video generation.
2. **Image-to-Video Workflow**: In this isolated chat, the worker uploads the approved reference image and prompts Veo to generate the 8-10 second video clip.
3. **Parallel Processing**: Because the video is generating in a separate background thread, the user can continue accepting/modifying reference images for Scene 2 and Scene 3 in the frontend simultaneously!
4. **Cloud Storage**: Once Veo finishes a video in the background chat, the worker downloads the .mp4 and uploads it to Supabase Storage.

## Phase 4: Final Stitching & Delivery (FFMPEG)
1. **Assembly Trigger**: A listener checks when all 6 video clips have successfully finished generating and uploading.
2. **Cloud Rendering**: A final GitHub Action boots up, downloads the 6 clips, and uses `ffmpeg` (pre-installed on Ubuntu servers) to seamlessly stitch them together.
3. **Final Delivery**: The master 60-second `.mp4` is uploaded, and the frontend UI updates to present the final cinematic video to the user.
