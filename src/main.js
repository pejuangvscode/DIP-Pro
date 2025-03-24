import './style.css'

document.querySelector('#app').innerHTML = `
  <header class="header">
    <div class="logo">LOGO</div>
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
    <p>Aliquam et erat nec urna hendrerit sollicitudin. Sed convallis hendrerit tortor, egestas vehicula quam gravida vitae. Ut id rhoncus dolor, eu malesuada felis. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Ut sed laoreet lacus. Etiam dictum augue quis risus fermentum porttitor. Vivamus nec aliquet felis.</p>
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
          <h4>Final Dilated</h4>
          <canvas id="outputFinalDilated"></canvas>
        </div>
      </div>
    </div>
    
    <div class="result-container">
      <h3>Result</h3>
      <p id="result" class="result-text">Upload an image to see the wound area measurement</p>
    </div>
  </div>
`;

// Hide processing steps initially
document.getElementById('processingSteps').style.display = 'none';

// Tunggu sampai OpenCV siap sebelum menjalankan kode
function waitForOpenCV(callback) {
    if (window.cv && cv.getBuildInformation) {
        console.log('OpenCV loaded successfully');
        callback();
    } else {
        console.log('Waiting for OpenCV...');
        setTimeout(() => waitForOpenCV(callback), 100);
    }
}

// Fungsi utama untuk memproses gambar
function processWoundImage(image) {
    // Show processing steps
    document.getElementById('processingSteps').style.display = 'block';
    
    let imgElement = new Image();
    imgElement.src = URL.createObjectURL(image);
    imgElement.onload = function () {
        let canvas = document.getElementById('outputCanvas');
        let ctx = canvas.getContext('2d');
        canvas.width = imgElement.width;
        canvas.height = imgElement.height;
        ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);

        let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let src = cv.matFromImageData(imgData);

        // Konversi ke grayscale
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.imshow('outputGrayscale', gray);

        // Blurring gambar
        let blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(19, 19), 0);
        cv.imshow('outputBlur', blurred);

        // Thresholding dengan Otsu's method
        let thresh = new cv.Mat();
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        cv.imshow('outputThreshold', thresh);

        // Mencari kontur
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        // Menghapus bentuk kecil (noise)
        let minArea = 100;
        let largeContours = [];
        for (let i = 0; i < contours.size(); i++) {
            let cnt = contours.get(i);
            if (cv.contourArea(cnt) > minArea) {
                largeContours.push(cnt);
            }
        }

        // Dilasi untuk menggabungkan bentuk kecil
        let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2, 2));
        let dilated = new cv.Mat();
        cv.dilate(thresh, dilated, kernel);
        cv.imshow('outputDilated', dilated);

        // Erosi untuk mengembalikan ukuran area luka
        let eroded = new cv.Mat();
        cv.erode(dilated, eroded, kernel);
        cv.imshow('outputErosion', eroded);

        // Deteksi Canny
        let edges = new cv.Mat();
        cv.Canny(eroded, edges, 100, 200);
        cv.imshow('outputCanny', edges);

        // Dilasi akhir untuk menemukan kontur akhir
        let finalDilated = new cv.Mat();
        cv.dilate(edges, finalDilated, kernel);
        cv.imshow('outputFinalDilated', finalDilated);

        // Menghitung area luka
        let finalContours = new cv.MatVector();
        cv.findContours(finalDilated, finalContours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        let woundAreaPx = 0;
        for (let i = 0; i < finalContours.size(); i++) {
            woundAreaPx += cv.contourArea(finalContours.get(i));
        }

        let dpi = 180;
        let pxToCm = 2.54 / dpi;
        let woundAreaCm2 = woundAreaPx * (pxToCm ** 2);

        document.getElementById('result').innerText = `Wound Area: ${woundAreaCm2.toFixed(2)} cm²`;

        // Hapus matriks dari memori
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
        finalContours.delete();
    };
}

// Tunggu OpenCV sebelum menambahkan event listener
waitForOpenCV(() => {
    document.getElementById('imageInput').addEventListener('change', function (event) {
        let file = event.target.files[0];
        if (file) {
            processWoundImage(file);
        }
    });
});