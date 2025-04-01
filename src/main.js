import './style.css'

document.querySelector('#app').innerHTML = `
  <header class="header">
    <div class="logo"><img src="logo.svg" width="20"/></div>
    <div class="app-name">Wound Scanner</div>
  </header>
  
  <div class="hero">
    <div class="content">
      <h1>Physical Wound Scanner</h1>
      <p>Scan by uploading your wound photo here to see the results.</p>
      
      <label for="imageInput" class="upload-button">
        <div>
          <img src="upload.svg" width="30" height="30"/>
          <path fill="none" d="M0 0h24v24H0z"/>
        </div>
        <input type="file" id="imageInput" accept="image/*" hidden>
      </label>
    </div>
  </div>
  
  <div class="info-section">
    <h2>What is Wound Scanner?</h2>
    <p>Wound Scanner is a digital imaging-based system designed to accurately measure wound areas using devices such as mobile or computer cameras. This system employs various image processing techniques, including grayscale conversion, threshold-based segmentation, and contour detection and measurement to identify and quantify the affected area. By utilizing image metadata, such as resolution and DPI, Wound Scanner converts measurement results from pixels to metric units to obtain a more precise wound size estimation. Developed as a telemedicine support tool, this technology enables patients or healthcare professionals to monitor wounds efficiently without requiring frequent direct contact. However, the accuracy of measurements may be influenced by several factors, including lighting conditions, camera resolution, and the distance between the device and the wound. Therefore, further development is needed to enhance accuracy and ensure the medical validity of this system.</p>
  </div>
  
  <div class="processing-container">
    <div class="processing-steps" id="processingSteps">
      <h3>Processing Steps</h3>
      <div class="canvas-container">
        <div class="canvas-item">
          <h4>Original Image</h4>
          <canvas id="outputCanvas"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Grayscale</h4>
          <canvas id="outputGrayscale"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Blurred</h4>
          <canvas id="outputBlur"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Threshold</h4>
          <canvas id="outputThreshold"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Dilated</h4>
          <canvas id="outputDilated"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Erosion</h4>
          <canvas id="outputErosion"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Canny Edge</h4>
          <canvas id="outputCanny"></canvas>
        </div>
        <div class="canvas-item">
          <h4>Wound Area</h4>
          <canvas id="outputWoundArea"></canvas>
        </div>
      </div>
    </div>
    
    <div class="result-container" id="resultContainer">
      <h3>Result</h3>
      <p id="result" class="result-text">Upload an image to see the wound area measurement</p>
    </div>
  </div>
`;

// Hide processing steps initially
document.getElementById('processingSteps').style.display = 'none';

// Function to scroll to the result container
function scrollToResult() {
  const resultContainer = document.getElementById('resultContainer');
  if (resultContainer) {
    // Adding a longer delay to ensure all processing is complete
    setTimeout(() => {
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500); // Increased from 200ms to 500ms for better reliability
  }
}

// Wait for OpenCV to be ready before running code
function waitForOpenCV(callback) {
    if (window.cv && cv.getBuildInformation) {
        console.log('OpenCV loaded successfully');
        callback();
    } else {
        console.log('Waiting for OpenCV...');
        setTimeout(() => waitForOpenCV(callback), 100);
    }
}

// Main function for processing wound image
function processWoundImage(image) {
    // Show processing steps
    document.getElementById('processingSteps').style.display = 'block';
    
    let imgElement = new Image();
    imgElement.src = URL.createObjectURL(image);
    imgElement.onload = function () {
        try {
            let canvas = document.getElementById('outputCanvas');
            let ctx = canvas.getContext('2d');
            canvas.width = imgElement.width;
            canvas.height = imgElement.height;
            ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);

            let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let src = cv.matFromImageData(imgData);

            // Convert to grayscale
            let gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            cv.imshow('outputGrayscale', gray);

            // Blur the image
            let blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(19, 19), 0);
            cv.imshow('outputBlur', blurred);

            // Threshold with Otsu's method
            let thresh = new cv.Mat();
            cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
            cv.imshow('outputThreshold', thresh);

            // Find contours
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            // Filter small shapes (noise) but we'll work with the original contours
            // and just calculate area for the ones that meet our criteria
            let minArea = 100;

            // Dilate to merge small shapes
            let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2, 2));
            let dilated = new cv.Mat();
            cv.dilate(thresh, dilated, kernel);
            cv.imshow('outputDilated', dilated);

            // Erosion to restore wound area size
            let eroded = new cv.Mat();
            cv.erode(dilated, eroded, kernel);
            cv.imshow('outputErosion', eroded);

            // Canny edge detection
            let edges = new cv.Mat();
            cv.Canny(eroded, edges, 100, 200);
            cv.imshow('outputCanny', edges);

            // Final dilation to find final contours
            let finalDilated = new cv.Mat();
            cv.dilate(edges, finalDilated, kernel);

            // Draw contour on original image
            let contourImage = src.clone();

            // Create matrix for mask
            let mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

            // Draw filled contours
            cv.drawContours(mask, contours, -1, new cv.Scalar(255), cv.FILLED);

            // Create matrix for color overlay
            let overlay = new cv.Mat(src.rows, src.cols, cv.CV_8UC4, new cv.Scalar(0, 255, 0, 100));

            // Combine overlay with original image using mask
            overlay.copyTo(contourImage, mask);

            // Add green outline around wound area
            cv.drawContours(contourImage, contours, -1, new cv.Scalar(0, 255, 0, 255), 2);

            // Display result with colored wound area
            cv.imshow('outputWoundArea', contourImage);

            // Calculate wound area (only for contours larger than minArea)
            let woundAreaPx = 0;
            for (let i = 0; i < contours.size(); i++) {
                let cnt = contours.get(i);
                let area = cv.contourArea(cnt);
                if (area > minArea) {
                    woundAreaPx += area;
                }
            }

            let dpi = 190;
            let pxToCm = 2.54 / dpi;
            let woundAreaCm2 = woundAreaPx * (pxToCm ** 2);

            document.getElementById('result').innerText = `Wound Area: ${woundAreaCm2.toFixed(2)} cm²`;

            // Clean up matrices from memory
            src.delete();
            gray.delete();
            blurred.delete();
            thresh.delete();
            contours.delete();
            hierarchy.delete();
            dilated.delete();
            eroded.delete();
            edges.delete();
            finalDilated.delete();
            contourImage.delete();
            mask.delete();
            overlay.delete();

            // Scroll to result after processing is complete - with forced delay
            setTimeout(() => {
                scrollToResult();
            }, 800);
            
        } catch (error) {
            console.error('Error processing image:', error);
            document.getElementById('result').innerText = `Error: ${error.message}`;
            
            // Still scroll to result even if there's an error
            setTimeout(() => {
                scrollToResult();
            }, 500);
        }
    };
}

// Wait for OpenCV before adding event listener
waitForOpenCV(() => {
    document.getElementById('imageInput').addEventListener('change', function (event) {
        let file = event.target.files[0];
        if (file) {
            processWoundImage(file);
        }
    });
});