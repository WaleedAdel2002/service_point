const roadsPath = 'data/roads.json';
const servicesPath = 'data/point.json';
const borderPath = 'data/border.json'; // إضافة مسار ملف الحدود

let graph = {};
let edgeLengths = {};
let servicePoints = [];
let map, userLat, userLng;

// تعريف طبقات Leaflet
let roadsLayer = L.layerGroup();
let servicePointsLayer = L.layerGroup(); // طبقة لنقاط الخدمة
let routeLayer = L.layerGroup();
let borderLayer = L.layerGroup(); // طبقة للحدود

let userMarker = null;
let destinationMarker = null;

// أيقونات مخصصة
const greenIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const redIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// دوال لتنسيق الوقت والمسافة
function formatTime(minutes) {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutesPart = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let parts = [];
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutesPart > 0) parts.push(`${minutesPart} دقيقة`);
  if (seconds > 0) parts.push(`${seconds} ثانية`);
  return parts.join(" و ");
}

function formatDistance(km) {
  const meters = Math.round(km * 1000);
  const kmPart = Math.floor(meters / 1000);
  const mPart = meters % 1000;
  let parts = [];
  if (kmPart > 0) parts.push(`${kmPart} كم`);
  if (mPart > 0) parts.push(`${mPart} متر`);
  return parts.join(" و ");
}

function findClosestNode(x, y, nodes) {
  let minDist = Infinity, closest = null;
  for (const node of nodes) {
    const [nx, ny] = node.split(',').map(Number);
    const d = (nx - x) ** 2 + (ny - y) ** 2;
    if (d < minDist) {
      minDist = d;
      closest = node;
    }
  }
  return closest;
}

// دالة للحصول على اتجاه النص
function getDirectionText(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle >= -22.5 && angle < 22.5) return "شرقًا";
  if (angle >= 22.5 && angle < 67.5) return "شمال شرق";
  if (angle >= 67.5 && angle < 112.5) return "شمالًا";
  if (angle >= 112.5 && angle < 157.5) return "شمال غرب";
  if (angle >= 157.5 || angle < -157.5) return "غربًا";
  if (angle >= -157.5 && angle < -112.5) return "جنوب غرب";
  if (angle >= -112.5 && angle < -67.5) return "جنوبًا";
  if (angle >= -67.5 && angle < -22.5) return "جنوب شرق";
  return "";
}

// دالة لعرض معلومات الميزة في الشريط الجانبي في شكل جدول
function displayFeatureInfo(properties, title = "معلومات الميزة") {
  let infoHtml = `<h4>${title}</h4>`;
  infoHtml += '<table>';
  infoHtml += '<thead><tr><th>الخاصية</th><th>القيمة</th></tr></thead>';
  infoHtml += '<tbody>';
  for (const key in properties) {
    // تخطي الخصائص غير المرغوب فيها أو الفارغة
    if (properties.hasOwnProperty(key) && properties[key] !== null && properties[key] !== "" && key !== "FID") {
      infoHtml += `<tr><td><b>${key}</b></td><td>${properties[key]}</td></tr>`;
    }
  }
  infoHtml += '</tbody></table>';
  document.getElementById('info').innerHTML = infoHtml;
}

async function loadMap() {
  map = L.map('map').setView([26.09, 32.43], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // إضافة جميع طبقات Group إلى الخريطة
  roadsLayer.addTo(map);
  servicePointsLayer.addTo(map);
  routeLayer.addTo(map);
  borderLayer.addTo(map);

  const [roadsData, servicesData, borderData] = await Promise.all([ // تحميل بيانات الحدود
    fetch(roadsPath).then(res => res.json()),
    fetch(servicesPath).then(res => res.json()),
    fetch(borderPath).then(res => res.json()) // جلب بيانات الحدود
  ]);

  // معالجة بيانات الحدود
  L.geoJSON(borderData, {
    style: {
      color: 'purple',
      weight: 4
    },
    onEachFeature: function (feature, layer) {
      const name = feature.properties?.name || 'خط بدون اسم';
      layer.bindPopup(name);
      layer.on('click', function() {
        displayFeatureInfo(feature.properties || feature.attributes, `معلومات الحدود: ${name}`);
      });
    }
  }).addTo(borderLayer);


  roadsData.features.forEach(f => {
    const coords = f.geometry.paths?.[0] || f.geometry.coordinates;
    const props = f.attributes || f.properties;
    const totalTime = props.time || 1;
    const totalLength = props.length || 0;
    const segments = coords.length - 1;
    const perSegmentTime = totalTime / segments;
    const perSegmentLength = totalLength / segments;

    const fclass = props.fclass || 'unknown';
    const roadColor = getRoadColor(fclass);

    const roadPolyline = L.polyline(coords.map(c => [c[1], c[0]]), {
      color: roadColor,
      weight: 3,
      opacity: 0.8
    });
    roadPolyline.addTo(roadsLayer);
    roadPolyline.on('click', function() {
      displayFeatureInfo(props, `معلومات الطريق: ${props.name || props.fclass || 'غير معروف'}`);
    });


    for (let i = 0; i < segments; i++) {
      const a = coords[i], b = coords[i + 1];
      const from = `${a[0]},${a[1]}`;
      const to = `${b[0]},${b[1]}`;
      if (!graph[from]) graph[from] = {};
      if (!graph[to]) graph[to] = {};
      graph[from][to] = perSegmentTime;
      graph[to][from] = perSegmentTime;
      edgeLengths[`${from}_${to}`] = perSegmentLength;
      edgeLengths[`${to}_${from}`] = perSegmentLength;
    }
  });

  const typesSet = new Set();
  servicePoints = servicesData.features.map(f => {
    let coord;
    if (f.geometry.coordinates) {
      coord = f.geometry.coordinates;
    } else if (f.geometry.x && f.geometry.y) {
      coord = [f.geometry.x, f.geometry.y];
    }
    const props = f.attributes || f.properties;
    const name = props?.Name || "خدمة";
    const type = props?.type || "غير معروف";
    const latlng = [coord[1], coord[0]];
    typesSet.add(type);

    const marker = L.marker(latlng).bindPopup(name);
    marker.on('click', function() {
      displayFeatureInfo(props, `معلومات الخدمة: ${name}`);
    });
    return { coord: latlng, name, type, marker: marker }; // تخزين العلامة مع نقطة الخدمة
  });

  const typeSelect = document.getElementById("typeFilter");
  Array.from(typesSet).sort().forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeSelect.appendChild(option);
  });

  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userLat, userLng], { icon: greenIcon }).addTo(map).bindPopup("📍 أنت هنا").openPopup();

    runRouting();
  });

  typeSelect.addEventListener("change", runRouting);

  // إعداد عناصر التحكم في الطبقات
  setupLayerControls();
}

// دالة لإعداد عناصر التحكم في الطبقات
function setupLayerControls() {
  document.getElementById('toggleRoads').addEventListener('change', function() {
    if (this.checked) {
      map.addLayer(roadsLayer);
    } else {
      map.removeLayer(roadsLayer);
    }
  });

  document.getElementById('toggleServicePoints').addEventListener('change', function() {
    if (this.checked) {
      map.addLayer(servicePointsLayer);
    } else {
      map.removeLayer(servicePointsLayer);
    }
  });

  document.getElementById('toggleRoute').addEventListener('change', function() {
    if (this.checked) {
      map.addLayer(routeLayer);
    } else {
      map.removeLayer(routeLayer);
    }
  });

  document.getElementById('toggleBorder').addEventListener('change', function() {
    if (this.checked) {
      map.addLayer(borderLayer);
    } else {
      map.removeLayer(borderLayer);
    }
  });
}

function runRouting() {
  if (!userLat || !userLng) return;

  const selectedType = document.getElementById("typeFilter").value;
  const userNode = findClosestNode(userLng, userLat, Object.keys(graph));

  let best = { dist: Infinity, length: 0, service: null, path: [] };

  // إخفاء جميع نقاط الخدمة أولاً
  servicePointsLayer.clearLayers();

  // تصفية وعرض نقاط الخدمة ذات الصلة فقط
  servicePoints.forEach(s => {
    if (selectedType === "all" || s.type === selectedType) {
      s.marker.addTo(servicePointsLayer); // أعد إضافة العلامة إلى الطبقة المرئية
    }
  });

  servicePoints.forEach(s => {
    if (selectedType !== "all" && s.type !== selectedType) return;

    const [lat, lng] = s.coord;
    const targetNode = findClosestNode(lng, lat, Object.keys(graph));

    try {
      const path = dijkstra.find_path(graph, userNode, targetNode);
      let totalTime = 0, totalLength = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i], to = path[i + 1];
        totalTime += graph[from][to];
        totalLength += edgeLengths[`${from}_${to}`] || 0;
      }
      if (totalTime < best.dist) {
        best = { dist: totalTime, length: totalLength, service: s, path };
      }
    } catch (e) {
      console.warn('لا يمكن الوصول إلى:', s.name);
    }
  });

  routeLayer.clearLayers();

  if (destinationMarker) map.removeLayer(destinationMarker);

  if (best.path.length > 0) {
    const latlngs = best.path.map(str => str.split(',').reverse().map(Number));
    L.polyline(latlngs, { color: 'blue' }).addTo(routeLayer);
    map.fitBounds(latlngs, { padding: [50, 50] }); // إضافة بعض الحشوة

    destinationMarker = L.marker(best.service.coord, { icon: redIcon })
      .addTo(map)
      .bindPopup(`📌 ${best.service.name}`)
      .openPopup();

    let stepsHtml = "<hr><b>تفاصيل المسار:</b><br>";
    for (let i = 0; i < best.path.length - 1; i++) {
      const from = best.path[i].split(',').map(Number).reverse();
      const to = best.path[i + 1].split(',').map(Number).reverse();
      const direction = getDirectionText(from, to);
      const dist = edgeLengths[`${best.path[i]}_${best.path[i + 1]}`] || 0;
      const timeSegment = graph[best.path[i]][best.path[i+1]] || 0;
      stepsHtml += `➡️ ${direction} لمسافة <b>${formatDistance(dist)}</b> في <b>${formatTime(timeSegment)}</b><br>`;
    }
    stepsHtml += `✅ الوصول إلى: <b>${best.service.name}</b>`;

    document.getElementById('info').innerHTML = `
      أقرب نقطة: <b>${best.service.name}</b><br>
      نوع الخدمة: <b>${best.service.type}</b><br>
      زمن الوصول التقريبي: <b>${formatTime(best.dist)}</b><br>
      المسافة التقريبية: <b>${formatDistance(best.length)}</b><br>
      ${stepsHtml}
    `;
  } else {
    document.getElementById('info').textContent = 'لم يتم العثور على مسار مناسب.';
  }
}

document.getElementById("locateBtn").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    if (userMarker) {
      map.removeLayer(userMarker);
    }

    userMarker = L.marker([userLat, userLng], { icon: greenIcon })
      .addTo(map)
      .bindPopup("📍 أنت هنا")
      .openPopup();

    map.setView([userLat, userLng], 15); // تكبير وعرض موقع المستخدم
    runRouting();
  });
});

function getRoadColor(fclass) {
  switch (fclass) {
    case 'motorway':
    case 'highway':
      return '#ff4d4d'; // أحمر للطرق السريعة
    case 'primary':
      return '#ffa500'; // برتقالي للطرق الرئيسية
    case 'secondary':
      return '#28a745'; // أخضر للطرق الثانوية
    case 'residential':
      return '#007bff'; // أزرق للمناطق السكنية
    case 'track':
      return '#8e44ad'; // بنفسجي للطرق الترابية
    default:
      return 'gray'; // اللون الافتراضي
  }
}

loadMap();