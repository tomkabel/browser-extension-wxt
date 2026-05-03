


As a senior expert in authentication research and Human-Computer Interaction (HCI), I have observed a distinct paradigm shift in recent years. While the cybersecurity industry has aggressively pushed mainstream cryptography-based solutions (e.g., FIDO2 passkeys, zero-trust architectures), the HCI and usable security academic communities have been quietly pioneering **cognitive and behavioral authentication mechanisms**. These approaches recognize that human memory is highly associative, spatial, and visual, making text and numerical PINs cognitively unnatural. 

Below is an organized summary of the most notable and truly innovative peer-reviewed works published since 2021. These papers propose fundamental replacements for text/PIN authentication, focusing entirely on visual, spatial, and behavioral gestures with high memorability and fast, intuitive UI/UX.

---

### 1. Object-Selection Graphical Authentication (Contextual & Visual)
This category closely mirrors your illustrative example, replacing abstract grids with meaningful, context-driven image recognition.

* **Citation:** Palash, R. A. Y., Giri, D., Meng, W., & Hore, S. (2024). *"GPOD: An efficient and secure graphical password authentication system by fast object detection."* Multimedia Tools and Applications, 83(19), 56569–56618. [1]
* **Mechanism:** Instead of selecting generic image tiles from a grid, users authenticate by selecting specific recognized objects natively embedded within a high-definition image. For example, a user might authenticate by sequentially selecting a red car, a specific cloud, and a streetlamp within a bustling cityscape photo. 
* **Why it meets the criteria:** The human brain has exceptional episodic and visual memory capacities. GPOD leverages this by using fast object detection (AI) to turn any standard image into an authentication canvas. The cognitive load is vastly lower than recalling a 12-character string, and the user experience is highly intuitive—requiring only a sequence of rapid taps on familiar objects. 

### 2. Gaze-Trajectory and Image Selection (Visual & Behavioral)
Gaze-based authentication has matured rapidly, shifting from slow "eye-typing" to fluid, behavioral biometrics that require zero physical touch.

* **Citation:** *"Proposal and Evaluation of a Gaze Authentication Method that Combines Image Selection and Eye Movement Trajectory Features."* Proceedings of the 12th International Symposium on Computing and Networking Workshops (CANDARW), IEEE, November 2024. [2]
* **Mechanism:** The user authenticates by looking at a set of images and smoothly drawing a pre-defined path or character over them purely with their eye movement. The system tracks both the sequence of images the user gazes at and the micro-behavioral trajectory (fixations and saccades) of their eyes.
* **Why it meets the criteria:** It is entirely non-textual and touchless. It relies on a combination of visual memory (knowing which images to look at) and spatial/motor memory (the shape of the gaze path). Because the system relies on the biological uniqueness of eye trajectories, it authenticates the user in real-time while being functionally immune to shoulder-surfing.

### 3. Free-Form Sketch & "Drawmetric" Authentication (Spatial & Motor Recall)
Moving away from the restrictive 3x3 grid of Android pattern locks, researchers have explored "free-form" sketch canvases that rely on spatial recall and motor-muscle memory.

* **Citation:** Joseph, E. O., Temitope, J. F., & Folasade, A. A. (2024). *"SEC-SKETCH: A Secret-Sketch Graphical Authentication System."* Journal of Current Trends in Computer Science Research, 3(5), 1-9. [3]
* **Related 2025 Extension:** *"Hybrid Graphical Password Authentication System Using Intuitive Approach."* 2025 1st International Conference on Secure IoT, Assured and Trusted Computing (SATC). IEEE. [4]
* **Mechanism:** SEC-SKETCH and "Drawmetric" systems present the user with a blank orthogonal matrix canvas. The user authenticates by sketching a personalized free-form shape, symbol, or combination of strokes. The system evaluates both the visual geometry of the sketch and the behavioral dynamics (velocity, pressure, and sequence) of the strokes.
* **Why it meets the criteria:** Drawing a simple geometric shape (e.g., a stylized star or a looping curve) relies on deeply ingrained motor-muscle memory rather than declarative memory. It provides an excellent, fast UI/UX, takes less than 3 seconds to execute, and naturally resists algorithmic brute-forcing because the input space is continuous rather than discrete.

### 4. Spatio-Bodily Authentication for Immersive Environments (Spatial & Gaze)
With the rise of Extended Reality (XR) and spatial computing, authentication requires moving beyond 2D screens into 3D physical interactions. 

* **Citation:** Kumar, A. (2022). *"PassWalk: Spatial Authentication Leveraging Lateral Shift and Gaze on Mobile Headsets."* Proceedings of the 30th ACM International Conference on Multimedia (MM '22). [5]
* **Mechanism:** Designed for headsets (AR/VR), PassWalk requires the user to authenticate by executing a specific sequence of lateral body shifts (stepping or shifting weight left/right) while fixing their gaze on targeted virtual objects in 3D space. 
* **Why it meets the criteria:** PassWalk entirely eliminates virtual keyboards. It relies on proprioception (the body's ability to sense its spatial movement) and spatial memory. The study demonstrated that users could authenticate in an average of 5 seconds. Because it utilizes gross motor movement and gaze, it boasts near-zero cognitive load once the "dance" or "shift pattern" is learned.

### Summary of the HCI Shift
What these papers collectively demonstrate is a pivot from **declarative knowledge** ("what is my password?") to **episodic, spatial, and procedural knowledge** ("what objects do I recognize?", "what shape do I draw?", "where do I look?"). By mapping authentication challenges to the brain's natural strengths—visual object recognition and spatial mapping—these systems achieve high security (combating shoulder-surfing and automated attacks) while drastically improving the end-user experience.




