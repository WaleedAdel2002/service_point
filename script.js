const roadsPath = 'data/roads.json';
const servicesPath = 'data/point.json';
const borderPath = 'data/border.json';

let graph = {};
let edgeLengths = {};
let servicePoints = [];
let map, userLat, userLng;

let roadsLayer = L.layerGroup();
let servicePointsLayer = L.layerGroup();
let routeLayer = L.layerGroup();
let borderLayer = L.layerGroup();

let userMarker = null;
let destinationMarker = null;

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

const serviceIconMap = {
    "مستشفى": { localImage: 'images/hospital.png' },
    "مدرسة": { localImage: 'images/school.png' },
    "جامعة": { color: 'purple' },
    "مسجد": { localImage: 'images/mosque.png' },
    "مركز صحي": { color: 'cadetblue' },
    "مخبز": { localImage: 'images/bakery.png' },
    "صيدلية": { color: 'darkblue' },
    "بنك": { localImage: 'images/bank.png' },
    // أضف المزيد من الأنواع هنا مع مسارات صورك المحلية أو الألوان
};

function getServiceIcon(type) {
    const iconConfig = serviceIconMap[type];
    let iconUrl;
    let iconOptions = {
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
    };

    if (iconConfig && iconConfig.localImage) {
        iconUrl = iconConfig.localImage;
    } else if (iconConfig && iconConfig.color) {
        iconUrl = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-${iconConfig.color}.png`;
    } else {
        iconUrl = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png`;
    }

    return L.icon({
        iconUrl: iconUrl,
        ...iconOptions
    });
}

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

function togglePopup() {
    const popup = document.getElementById("info-popup");
    const overlay = document.getElementById("info-overlay");
    if (popup.style.display === "block") {
        popup.style.display = "none";
        overlay.style.display = "none";
    } else {
        popup.style.display = "block";
        overlay.style.display = "block";
    }
}

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

function displayFeatureInfo(properties, title = "معلومات الميزة") {
  let infoHtml = `<h4>${title}</h4>`;
  infoHtml += '<table>';
  infoHtml += '<thead><tr><th>الخاصية</th><th>القيمة</th></tr></thead>';
  infoHtml += '<tbody>';
  for (const key in properties) {
    if (properties.hasOwnProperty(key) && properties[key] !== null && properties[key] !== "" && key !== "FID") {
      infoHtml += `<tr><td><b>${key}</b></td><td>${properties[key]}</td></tr>`;
    }
  }
  infoHtml += '</tbody></table>';
  document.getElementById('info').innerHTML = infoHtml;
}

function displayServicePoints(filterValue) {
    servicePointsLayer.clearLayers();
    servicePoints.forEach(s => {
        if (filterValue === "all" || s.type === filterValue) {
            s.marker.addTo(servicePointsLayer);
        }
    });
}

// *** تم تعديل هذه الدالة لتشمل مفتاح الخدمات والطرق والحدود ***
function generateMapLegendControl() {
    const legend = L.control({ position: 'topleft' }); // الموضع: الركن الأيسر العلوي

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend'); // إنشاء div لمفتاح الخريطة
        div.innerHTML = '<h4>مفتاح الخريطة:</h4>'; // عنوان المفتاح الرئيسي

        // مفتاح الخدمات
        div.innerHTML += '<h5>نقاط الخدمة:</h5>';
        const uniqueServiceTypes = new Set(servicePoints.map(s => s.type));
        Array.from(uniqueServiceTypes).sort().forEach(type => {
            const iconConfig = serviceIconMap[type];
            let iconSrc;

            if (iconConfig && iconConfig.localImage) {
                iconSrc = iconConfig.localImage;
            } else if (iconConfig && iconConfig.color) {
                iconSrc = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-${iconConfig.color}.png`;
            } else {
                iconSrc = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png`;
            }

            div.innerHTML += `
                <div class="legend-item">
                    <img src="${iconSrc}" class="legend-icon" alt="${type}">
                    <span>${type}</span>
                </div>
            `;
        });

        // مفتاح الطرق
        div.innerHTML += '<h5>الطرق:</h5>';
        const roadClasses = {
            'footway': 'footway',
            'residential': 'residential',
            'primary': 'primary',
            'trunk': 'trunk',
            'unclassified': 'unclassified',
            'track': 'طريق ترابي',
            'default': 'أخرى/غير معروف' // لتمثيل الفئات غير المعروفة
        };

        const uniqueRoadClasses = new Set();
        roadsLayer.eachLayer(layer => {
            const properties = layer.feature?.properties || layer.feature?.attributes;
            const fclass = properties?.fclass || 'default';
            uniqueRoadClasses.add(fclass);
        });

        const sortedRoadClasses = Array.from(uniqueRoadClasses).sort();
        // تأكد من أن 'default' يظهر دائمًا في النهاية إذا كان موجودًا
        if (sortedRoadClasses.includes('default')) {
            sortedRoadClasses.splice(sortedRoadClasses.indexOf('default'), 1);
            sortedRoadClasses.push('default');
        }

        sortedRoadClasses.forEach(fclass => {
            const color = getRoadColor(fclass);
            const displayName = roadClasses[fclass] || roadClasses['default'];
            div.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color-box" style="background-color: ${color};"></div>
                    <span>${displayName}</span>
                </div>
            `;
        });

        // مفتاح الحدود
        div.innerHTML += '<h5>الحدود:</h5>';
        div.innerHTML += `
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: purple;"></div>
                <span>حدود المنطقة</span>
            </div>
        `;

        return div;
    };
    return legend;
}

async function loadMap() {
  map = L.map('map').setView([26.09, 32.43], 12);

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  osmLayer.addTo(map);

  roadsLayer.addTo(map);
  servicePointsLayer.addTo(map);
  routeLayer.addTo(map);
  borderLayer.addTo(map);

  const baseMaps = {
    "خريطة الشارع": osmLayer,
    "صور جوية": esriWorldImagery
  };

  L.control.layers(baseMaps).addTo(map);

  const [roadsData, servicesData, borderData] = await Promise.all([
    fetch(roadsPath).then(res => res.json()),
    fetch(servicesPath).then(res => res.json()),
    fetch(borderPath).then(res => res.json())
  ]);

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

    const marker = L.marker(latlng, { icon: getServiceIcon(type) }).bindPopup(name);
    marker.on('click', function() {
      displayFeatureInfo(props, `معلومات الخدمة: ${name}`);
    });
    return { coord: latlng, name, type, marker: marker };
  });

  const typeSelect = document.getElementById("typeFilter");
  Array.from(typesSet).sort().forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeSelect.appendChild(option);
  });

  displayServicePoints('all');

  typeSelect.addEventListener("change", () => {
    const selectedType = document.getElementById("typeFilter").value;
    displayServicePoints(selectedType);
    if (userLat && userLng) {
        runRouting();
    } else {
        document.getElementById('info').textContent = 'الرجاء تحديد موقعك أولاً أو الضغط على "موقعي".';
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
    }
  });

  setupLayerControls();

  // *** تم نقل استدعاء مفتاح الخريطة إلى هنا بعد تحميل جميع البيانات ***
  const mapLegendControl = generateMapLegendControl();
  mapLegendControl.addTo(map);
}

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
  if (!userLat || !userLng) {
    document.getElementById('info').textContent = 'الرجاء تحديد موقعك أولاً.';
    routeLayer.clearLayers();
    if (destinationMarker) map.removeLayer(destinationMarker);
    return;
  }

  const selectedType = document.getElementById("typeFilter").value;
  if (selectedType === "all") {
    document.getElementById('info').textContent = 'الرجاء اختيار نوع خدمة محدد لتحديد أقرب نقطة.';
    routeLayer.clearLayers();
    if (destinationMarker) map.removeLayer(destinationMarker);
    return;
  }

  const userNode = findClosestNode(userLng, userLat, Object.keys(graph));

  let best = { dist: Infinity, length: 0, service: null, path: [] };

  servicePoints.forEach(s => {
    if (s.type !== selectedType) return;

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
      console.warn('لا يمكن الوصول إلى:', s.name, e);
    }
  });

  routeLayer.clearLayers();

  if (destinationMarker) map.removeLayer(destinationMarker);

  if (best.path.length > 0) {
    const latlngs = best.path.map(str => str.split(',').reverse().map(Number));
    L.polyline(latlngs, { color: 'blue' }).addTo(routeLayer);
    map.fitBounds(latlngs, { padding: [50, 50] });

    destinationMarker = L.marker(best.service.coord, { icon: getServiceIcon(best.service.type) })
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
    document.getElementById('info').textContent = 'لم يتم العثور على مسار مناسب لنوع الخدمة المحدد من موقعك الحالي.';
  }
}

document.getElementById("locateBtn").addEventListener("click", () => {
  document.getElementById('info').textContent = 'جارٍ تحديد موقعك...';
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

    map.setView([userLat, userLng], 15);
    runRouting();
  }, (error) => {
      console.error("خطأ في تحديد الموقع:", error);
      document.getElementById('info').textContent = 'تعذر تحديد موقعك. يرجى التأكد من تفعيل خدمات الموقع.';
  });
});

function getRoadColor(fclass) {
  switch (fclass) {
    case 'motorway':
    case 'highway':
      return '#ff4d4d';
    case 'primary':
      return '#ffa500';
    case 'secondary':
      return '#28a745';
    case 'residential':
      return '#007bff';
    case 'track':
      return '#8e44ad';
    default:
      return 'gray';
  }
}

loadMap();
