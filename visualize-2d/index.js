window.onload = function () {
  // Lấy các đối tượng HTML
  const canvas = document.getElementById('drawingCanvas');
  const canvasContainer = document.querySelector('.canvas-container');
  const ctx = canvas.getContext('2d');
  const coordInput = document.getElementById('coordInput');

  // Lấy các nút bấm
  const btnDrawPolygon = document.getElementById('btnDrawPolygon');
  const btnDrawPoints = document.getElementById('btnDrawPoints');
  const btnClear = document.getElementById('btnClear');
  const btnResetView = document.getElementById('btnResetView');

  // Biến toàn cục để lưu trạng thái vẽ cuối cùng
  let lastDrawnData = {
    pointArrays: null, // Thay `points` bằng `pointArrays`
    isPolygon: false
  };

  // Trạng thái camera và pan/zoom
  const camera = {
    x: 0,       // Tọa độ x của tâm camera trong "world space"
    y: 0,       // Tọa độ y của tâm camera trong "world space"
    zoom: 1,    // Mức độ zoom
    isPanning: false,
    lastMouse: { x: 0, y: 0 }
  };

  // Mảng màu để vẽ các hình khác nhau
  const COLORS = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1'];

  // --- CÁC HÀM TIỆN ÍCH ---

  /**
   * Thay đổi kích thước canvas để lấp đầy container của nó
   */
  function resizeCanvas() {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    redraw(); // Vẽ lại nội dung sau khi thay đổi kích thước
  }

  /**
   * Phân tích text từ textarea thành một mảng các đối tượng tọa độ.
   * Trả về một mảng các mảng tọa độ hoặc null nếu có lỗi.
   * Chấp nhận cả `[{...}]` và `[[{...}], [{...}]]`
   */
  function parseCoordinates() {
    const text = coordInput.value.trim();
    if (!text) {
      alert("Vui lòng nhập dữ liệu tọa độ.");
      return null;
    }
    try {
      // Cố gắng parse chuỗi JSON
      const data = JSON.parse(text);
      // Kiểm tra xem có phải là mảng không
      if (!Array.isArray(data)) {
        alert("Dữ liệu phải là một mảng (Array).");
        return null;
      }

      // Nếu mảng rỗng, không có gì để vẽ
      if (data.length === 0) {
        return [];
      }

      // Kiểm tra xem phần tử đầu tiên có phải là mảng không
      // Đây là cách đơn giản để phát hiện định dạng [[{..}], ..]
      if (Array.isArray(data[0])) {
        // Giả định đây là mảng của các mảng điểm
        return data;
      } else {
        // Nếu không, bọc nó trong một mảng để xử lý nhất quán
        return [data];
      }
    } catch (e) {
      alert("Lỗi cú pháp JSON. Vui lòng kiểm tra lại dữ liệu đầu vào.\n\nChi tiết lỗi: " + e.message);
      return null;
    }
  }

  /**
   * Tìm ra giới hạn (min/max) của các tọa độ để tự động căn chỉnh
   */
  function getBounds(pointArrays) {
    if (pointArrays.length === 0 || pointArrays[0].length === 0) return null;

    let allPoints = [].concat.apply([], pointArrays); // Làm phẳng mảng
    if (allPoints.length === 0) return null;

    let minX = allPoints[0].x, maxX = allPoints[0].x;
    let minY = allPoints[0].y, maxY = allPoints[0].y;

    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * Vẽ một điểm (hình tròn nhỏ) lên canvas
   */
  function drawPoint(worldX, worldY, label) {
    const pointRadius = 5 / camera.zoom; // Kích thước điểm không đổi khi zoom
    ctx.beginPath();
    ctx.arc(worldX, worldY, pointRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Ghi nhãn cho điểm
    ctx.fillStyle = 'black';
    ctx.font = `${12 / camera.zoom}px Arial`;
    ctx.fillText(label, worldX + (pointRadius * 1.5), worldY + (pointRadius * 0.5));
  }

  /**
   * Vẽ một đa giác (polygon) hoặc một đường nối các điểm (line strip)
   */
  function drawShapes(pointArrays, isPolygon = true) {
    if (!pointArrays || pointArrays.length === 0) return;

    ctx.save();
    // Áp dụng transform của camera
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, camera.y); // Lật trục Y ở đây

    // Vẽ từng shape
    pointArrays.forEach((points, shapeIndex) => {
      if (points.length < 1) return;

      // Bắt đầu vẽ đường
      ctx.beginPath();
      ctx.moveTo(points[0].x, -points[0].y); // Lật trục Y
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, -points[i].y); // Lật trục Y
      }

      // Nếu là polygon thì đóng đường lại
      if (isPolygon) {
        ctx.closePath();
      }

      ctx.strokeStyle = COLORS[shapeIndex % COLORS.length]; // Chọn màu xoay vòng
      ctx.lineWidth = 2 / camera.zoom; // Độ dày của đường không đổi khi zoom
      ctx.stroke();

      // Vẽ các điểm đỉnh lên trên đường
      points.forEach((p, index) => {
        // Dùng màu khác cho điểm để nổi bật
        drawPoint(p.x, -p.y, `P${index} (${p.x}, ${p.y})`); // Lật trục Y
      });
    });

    ctx.restore();
  }

  /**
   * Vẽ hệ trục tọa độ Oxy và lưới
   */
  function drawCoordinateSystem() {
    const { minX, maxX, minY, maxY } = getBounds(lastDrawnData.pointArrays);
    if (!minX || !maxX || !minY || !maxY) return; // Không có dữ liệu để vẽ

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, camera.y); // Lật trục Y ở đây

    const worldTopLeft = screenToWorld({ x: 0, y: 0 });
    const worldBottomRight = screenToWorld({ x: canvas.width, y: canvas.height });


    ctx.strokeStyle = '#ddd'; // Màu của lưới
    ctx.lineWidth = 1;
    ctx.font = '10px Arial';
    ctx.fillStyle = '#aaa';

    // --- Lưới và Nhãn Trục X ---
    const gridStepX = getGridStep((worldBottomRight.x - worldTopLeft.x) / 10);
    const startX = Math.floor(worldTopLeft.x / gridStepX) * gridStepX;
    const endX = Math.ceil(worldBottomRight.x / gridStepX) * gridStepX;

    for (let x = startX; x <= endX; x += gridStepX) {
      ctx.beginPath();
      ctx.moveTo(x, worldTopLeft.y);
      ctx.lineTo(x, worldBottomRight.y);
      ctx.stroke();
      ctx.fillText(x.toFixed(2), x + 4 / camera.zoom, worldTopLeft.y + 10 / camera.zoom);
    }


    // --- Lưới và Nhãn Trục Y ---
    const gridStepY = getGridStep((worldTopLeft.y - worldBottomRight.y) / 10);
    const startY = Math.floor(worldBottomRight.y / gridStepY) * gridStepY;
    const endY = Math.ceil(worldTopLeft.y / gridStepY) * gridStepY;


    for (let y = startY; y <= endY; y += gridStepY) {
      ctx.beginPath();
      ctx.moveTo(worldTopLeft.x, y);
      ctx.lineTo(worldBottomRight.x, y);
      ctx.stroke();
      ctx.fillText(y.toFixed(2), worldTopLeft.x + 4 / camera.zoom, y - 4 / camera.zoom);
    }

    // --- Vẽ Trục Tọa Độ (đậm hơn) ---
    ctx.strokeStyle = '#aaa'; // Màu của trục chính
    ctx.lineWidth = 2 / camera.zoom;

    // Trục X (y=0)
    ctx.beginPath();
    ctx.moveTo(worldTopLeft.x, 0);
    ctx.lineTo(worldBottomRight.x, 0);
    ctx.stroke();

    // Trục Y (x=0)
    ctx.beginPath();
    ctx.moveTo(0, worldTopLeft.y);
    ctx.lineTo(0, worldBottomRight.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Tính bước lưới hợp lý (vd: 1, 2, 5, 10, 20, 50, 100)
   */
  function getGridStep(targetSize) {
    const exponent = Math.floor(Math.log10(targetSize));
    const magnitude = Math.pow(10, exponent);
    const residual = targetSize / magnitude; // (1 to 10)
    if (residual > 5) return 10 * magnitude;
    if (residual > 2) return 5 * magnitude;
    if (residual > 1) return 2 * magnitude;
    return magnitude;
  }

  /**
   * Chuyển đổi tọa độ từ màn hình (pixel) sang thế giới (dữ liệu)
   */
  function screenToWorld(screenPos) {
    return {
      x: (screenPos.x - canvas.width / 2) / camera.zoom + camera.x,
      y: -((screenPos.y - canvas.height / 2) / camera.zoom - camera.y)
    };
  }

  /**
   * Tự động điều chỉnh camera để hiển thị tất cả các hình
   */
  function autoFit() {
    if (!lastDrawnData.pointArrays || lastDrawnData.pointArrays.length === 0) return;

    const bounds = getBounds(lastDrawnData.pointArrays);
    if (!bounds) return;

    const padding = 50;
    // Để tránh lỗi chia cho 0
    const dataWidth = (bounds.maxX - bounds.minX) || 1;
    const dataHeight = (bounds.maxY - bounds.minY) || 1;


    // Trung tâm của dữ liệu
    camera.x = bounds.minX + dataWidth / 2;
    camera.y = bounds.minY + dataHeight / 2;

    const scaleX = canvas.width / (dataWidth + padding * 2);
    const scaleY = canvas.height / (dataHeight + padding * 2);

    camera.zoom = Math.min(scaleX, scaleY);

    redraw();
  }


  // --- GÁN SỰ KIỆN CHO CÁC NÚT BẤM ---

  btnResetView.addEventListener('click', autoFit);

  btnClear.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastDrawnData.pointArrays = null; // Cũng xóa dữ liệu đã lưu
  });

  btnDrawPolygon.addEventListener('click', () => {
    const pointArrays = parseCoordinates();
    if (pointArrays) {
      lastDrawnData = { pointArrays, isPolygon: true };
      autoFit();
    }
  });

  btnDrawPoints.addEventListener('click', () => {
    const pointArrays = parseCoordinates();
    if (pointArrays) {
      lastDrawnData = { pointArrays, isPolygon: false };
      autoFit();
    }
  });

  /**
   * Vẽ lại nội dung canvas dựa trên trạng thái đã lưu
   */
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!lastDrawnData.pointArrays || lastDrawnData.pointArrays.length === 0) {
      return; // Không có gì để vẽ
    }

    // --- Vẽ các thành phần ---
    drawCoordinateSystem();
    drawShapes(lastDrawnData.pointArrays, lastDrawnData.isPolygon);
  }

  // --- KHỞI TẠO ---

  // Gán sự kiện resize cho cửa sổ
  window.addEventListener('resize', () => {
    resizeCanvas();
    autoFit(); // Tự động fit lại khi thay đổi kích thước cửa sổ
  });

  // Gán sự kiện cho pan và zoom
  canvas.addEventListener('mousedown', (e) => {
    camera.isPanning = true;
    camera.lastMouse = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!camera.isPanning) return;
    const dx = e.clientX - camera.lastMouse.x;
    const dy = e.clientY - camera.lastMouse.y;

    camera.x -= dx / camera.zoom;
    camera.y += dy / camera.zoom; // Y ngược lại

    camera.lastMouse = { x: e.clientX, y: e.clientY };
    redraw();
  });

  canvas.addEventListener('mouseup', () => {
    camera.isPanning = false;
  });
  canvas.addEventListener('mouseleave', () => {
    camera.isPanning = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); // Ngăn trang cuộn

    const zoomFactor = 1.1;
    const oldZoom = camera.zoom;
    const mouseWorldPos = screenToWorld({ x: e.clientX, y: e.clientY });

    if (e.deltaY < 0) {
      // Zoom in
      camera.zoom *= zoomFactor;
    } else {
      // Zoom out
      camera.zoom /= zoomFactor;
    }

    // Giữ cho điểm dưới con trỏ chuột ở đúng vị trí
    camera.x = mouseWorldPos.x - (e.clientX - canvas.width / 2) / camera.zoom;
    camera.y = mouseWorldPos.y + (e.clientY - canvas.height / 2) / camera.zoom;


    redraw();
  });


  // Gợi ý dữ liệu mẫu khi tải trang (giờ là mảng của các mảng)
  coordInput.value = JSON.stringify([
    [
      { "x": 2478, "y": -474 },
      { "x": 2478, "y": 1526 },
      { "x": 4578, "y": 1526 },
      { "x": 4578, "y": 4474 },
      { "x": -474, "y": 4474 },
      { "x": -474, "y": -474 }
    ],
    [
      { "x": 5000, "y": 5000 },
      { "x": 6000, "y": 4000 },
      { "x": 7000, "y": 5500 }
    ]
  ], null, 2);

  // Khởi tạo kích thước canvas lần đầu
  resizeCanvas();
  // Vẽ dữ liệu mẫu lúc ban đầu
  const initialPoints = parseCoordinates();
  if (initialPoints) {
    lastDrawnData = { pointArrays: initialPoints, isPolygon: true };
    autoFit();
  }
};