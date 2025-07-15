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

// متغير جديد لجمع جميع المصطلحات الفريدة للبحث عنها كاقتراحات
let allSearchableTerms = new Set();

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
    "مستشفى": { localImage: 'images/مستشفى.png' },
    "مدرسة": { localImage: 'images/مدرسة.jpg' },
    "جامعة": { color: 'purple' },
    "مسجد": { localImage: 'images/مسجد.png' },
    "مركز صحي": { color: 'cadetblue' },
    "مخبز": { localImage: 'images/bakery.png' },
    "صيدلية": { localImage: 'images/صيدلية.png' },
    "بنك": { localImage: 'images/بنك.jpg' },
    "نقطة اطفاء": { localImage: 'images/اطفاء.jpg' },
    "نقطة اسعاف": { localImage: 'images/اسعاف.png' },
    "بريد": { localImage: 'images/بريد.png' },
    "شرطة": { localImage: 'images/شرطة.jpg' },
    "مدرسة اعدادية": { localImage: 'images/مدرسة.jpg' },
    // أضف المزيد من الأنواع هنا مع مسارات صورك المحلية أو الألوان
};

function getRoadColor(fclass) {
    // قم بتحويل fclass إلى أحرف صغيرة للتأكد من المطابقة مع المفاتيح أدناه
    const lowerFclass = fclass.toLowerCase();

    switch (lowerFclass) {
        case 'motorway':
        case 'highway':
            return '#ff4d4d'; // أحمر ساطع للطرق السريعة والرئيسية جداً
        case 'primary':
            return '#ffa500'; // برتقالي للطرق الأساسية
        case 'primary_link':
            return '#ffb52e'; // برتقالي أفتح قليلاً لوصلات الطرق الأساسية
        case 'secondary':
            return '#28a745'; // أخضر للطرق الثانوية
        case 'trunk':
            return '#8e44ad'; // بنفسجي للطرق الجذعية
        case 'trunk_link':
            return '#4d2e7a'; // لون بنفسجي أغمق قليلا لوصلات الطرق الجذعية
        case 'unclassified':
            return '#28a745'; // أخضر للطرق غير المصنفة (قد تختلف حسب الأهمية)
        case 'residential':
            return '#007bff'; // أزرق للطرق السكنية
        case 'footway':
            return '#cccccc'; // رمادي فاتح لممرات المشاة
        case 'track':
            return '#A52A2A'; // بني للطرق الترابية (إذا كانت موجودة)
        default:
            return 'gray'; // رمادي افتراضي لأي فئة غير معروفة
    }
}

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

function formatDistance(metersInput) { // غيرنا اسم المتغير ليكون أوضح
    const meters = Math.round(metersInput); // الآن هي قيمة بالمتر بالفعل، فقط نقوم بتقريبها
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
    infoHtml += '<thead><tr><th>الحقل</th><th>القيمة</th></tr></thead>';
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

// دالة البحث عن الخدمات (مُعدلة لإخفاء الاقتراحات)
function searchServices() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    servicePointsLayer.clearLayers(); // قم بمسح الطبقة الحالية من نقاط الخدمة

    let foundMarkers = []; // لجمع العلامات التي تم العثور عليها

    servicePoints.forEach(s => {
        // ابحث في اسم الخدمة ونوعها
        const nameMatches = s.name.toLowerCase().includes(searchTerm);
        const typeMatches = s.type.toLowerCase().includes(searchTerm);

        if (nameMatches || typeMatches) {
            s.marker.addTo(servicePointsLayer);
            foundMarkers.push(s.marker); // أضف العلامة إلى قائمة النتائج
        }
    });

    // إذا كان هناك بحث، قم بتحديث عنصر التحكم في التصفية ليُظهر "الكل" أو "نتائج البحث"
    const typeFilterSelect = document.getElementById('typeFilter');
    if (searchTerm) {
        typeFilterSelect.value = "all"; // إعادة تعيين الفلتر إذا تم البحث
    } else {
        // إذا كان شريط البحث فارغاً، أعد عرض جميع النقاط بناءً على الفلتر الحالي
        displayServicePoints(typeFilterSelect.value);
    }

    // قم بتحديث معلومات الشريط الجانبي بناءً على نتائج البحث
    if (servicePointsLayer.getLayers().length > 0) {
        document.getElementById('info').innerHTML = `<h4>نتائج البحث:</h4><p>تم العثور على ${servicePointsLayer.getLayers().length} نقطة خدمة مطابقة لبحثك.</p>`;
        
        // ** إضافة جزء الزوم هنا **
        const group = new L.featureGroup(foundMarkers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] }); // تكبير الخريطة لتناسب العلامات

        // ** إضافة استدعاء runRouting هنا لتوليد المسار **
        if (userLat && userLng) {
            runRouting();
        } else {
            document.getElementById('info').innerHTML += '<br>الرجاء تحديد موقعك أولاً أو الضغط على "موقعي" لرسم المسار.';
        }

    } else {
        document.getElementById('info').innerHTML = `<h4>نتائج البحث:</h4><p>لم يتم العثور على أي نقطة خدمة مطابقة لبحثك.</p>`;
    }
    routeLayer.clearLayers(); // امسح أي مسار حالي
    if (destinationMarker) map.removeLayer(destinationMarker);

    // إخفاء الاقتراحات بعد إجراء البحث
    const suggestionsContainer = document.getElementById('suggestions-container');
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
}

// دالة جديدة لتحديث الاقتراحات
function updateSuggestions() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.toLowerCase();
    let suggestionsContainer = document.getElementById('suggestions-container');

    // إذا لم يكن هناك حاوية للاقتراحات، قم بإنشائها
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'suggestions-container';
        searchInput.parentNode.insertBefore(suggestionsContainer, searchInput.nextSibling);
    }

    suggestionsContainer.innerHTML = ''; // مسح الاقتراحات القديمة

    if (searchTerm.length === 0) {
        suggestionsContainer.style.display = 'none'; // إخفاء الحاوية إذا كان حقل البحث فارغًا
        return;
    }

    const filteredSuggestions = Array.from(allSearchableTerms).filter(term =>
        term.startsWith(searchTerm)
    ).slice(0, 5); // عرض 5 اقتراحات فقط

    if (filteredSuggestions.length > 0) {
        suggestionsContainer.style.display = 'block';
        filteredSuggestions.forEach(suggestion => {
            const suggestionItem = document.createElement('div');
            suggestionItem.classList.add('suggestion-item');
            suggestionItem.textContent = suggestion;
            suggestionItem.addEventListener('click', () => {
                searchInput.value = suggestion;
                suggestionsContainer.style.display = 'none';
                searchServices(); // قم بتشغيل البحث فورًا عند اختيار الاقتراح
            });
            suggestionsContainer.appendChild(suggestionItem);
        });
    } else {
        suggestionsContainer.style.display = 'none';
    }
}


async function loadMap() {
    map = L.map('map').setView([25.696, 32.664], 12);

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
        "OSM": osmLayer,
        "Google earth": esriWorldImagery
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
        const totalTime = props.time || 1; // Assuming 'time' is driving time
        const totaltime_Walking_ = props.time_Walking_ || (props.length / (5000 / 60)); // Calculate walking time if not provided, assuming 5 km/h = 5000m/60min
        const totalLength = props.length || 0;
        const segments = coords.length - 1;
        const perSegmentTime = totalTime / segments;
        const perSegmentime_Walking_ = totaltime_Walking_ / segments;
        const perSegmentLength = totalLength / segments;

        const fclass = props.fclass || 'unknown';
        const roadColor = getRoadColor(fclass);

        const roadPolyline = L.polyline(coords.map(c => [c[1], c[0]]), {
            color: roadColor,
            weight: 3,
            opacity: 0.8
        });
        // ** هذا السطر حيوي لجعل مفتاح الخريطة يعمل بشكل صحيح **
        roadPolyline.feature = f;
        
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
            // Modified: Store an object with drivingTime and walkingTime
            graph[from][to] = {
                drivingTime: perSegmentTime,
                walkingTime: perSegmentime_Walking_
            };
            graph[to][from] = { // Bidirectional
                drivingTime: perSegmentTime,
                walkingTime: perSegmentime_Walking_
            };
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

        // أضف اسم الخدمة ونوعها إلى قائمة المصطلحات القابلة للبحث
        allSearchableTerms.add(name.toLowerCase());
        allSearchableTerms.add(type.toLowerCase());
        
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

    // تم تعديل مستمع حدث "typeFilter" لكي لا يتعارض مع البحث
    // اجعل هذا المستمع يستدعي displayServicePoints مباشرة
    document.getElementById("typeFilter").addEventListener("change", () => {
        const selectedType = document.getElementById("typeFilter").value;
        document.getElementById('searchInput').value = ''; // مسح حقل البحث عند تغيير الفلتر
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
document.addEventListener('DOMContentLoaded', function () {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function () {
            sidebar.classList.toggle('open');
            // يمكنك إضافة أو إزالة فئة من الـ body لمنع التمرير إذا فتحت القائمة
            // document.body.classList.toggle('no-scroll');
        });

        // اختياري: إغلاق الشريط الجانبي عند النقر خارج الشريط الجانبي نفسه
        // هذا قد يتطلب بعض التعديل إذا كان لديك تفاعلات مباشرة مع الخريطة
        document.addEventListener('click', function(event) {
            // تحقق إذا كان النقر خارج الشريط الجانبي وخارج زر التبديل
            if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !menuToggle.contains(event.target)) {
                sidebar.classList.remove('open');
                // document.body.classList.remove('no-scroll');
            }
        });
    }

    // كود Accordion (تأكد من وجوده أو أضفه إذا لم يكن موجوداً)
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const accordionContent = this.nextElementSibling;
            const toggleIcon = this.querySelector('.toggle-icon');

            this.classList.toggle('active');
            toggleIcon.classList.toggle('active');

            if (accordionContent.style.display === 'block') {
                accordionContent.style.display = 'none';
            } else {
                accordionContent.style.display = 'block';
            }
        });
    });

    // لضمان فتح قسم البحث والتحكم افتراضياً عند تحميل الصفحة
    // قم بمحاكاة النقر على رؤوس الأكورديون لفتحها
    const searchHeader = document.getElementById('searchHeader');
    if (searchHeader) {
        searchHeader.click();
    }
    const filterHeader = document.getElementById('filterHeader');
    if (filterHeader) {
        filterHeader.click();
    }
    const mapControlsHeader = document.getElementById('mapControlsHeader'); // تأكد من وجود هذا الـ ID في HTML
    if (mapControlsHeader) {
        mapControlsHeader.click();
    }
});

// وظيفة togglePopup موجودة بالفعل لديك، تأكد من أنها في نفس الملف
function togglePopup() {
    const popup = document.getElementById('info-popup');
    const overlay = document.getElementById('overlay');
    if (popup.style.display === 'block') {
        popup.style.display = 'none';
        overlay.style.display = 'none';
    } else {
        popup.style.display = 'block';
        overlay.style.display = 'block';
    }
}

// ... بقية كود الـ JavaScript الخاص بك ...

function runRouting() {
    if (!userLat || !userLng) {
        document.getElementById('info').textContent = 'الرجاء تحديد موقعك أولاً.';
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
        return;
    }

    const selectedType = document.getElementById("typeFilter").value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let effectiveFilterType = null;
    let effectiveSearchTerm = null;

    if (selectedType !== "all") {
        effectiveFilterType = selectedType;
    } else if (searchTerm) {
        effectiveSearchTerm = searchTerm;
    } else {
        document.getElementById('info').textContent = 'الرجاء اختيار نوع خدمة محدد أو استخدام شريط البحث لتحديد أقرب نقطة.';
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
        return;
    }

    const userNode = findClosestNode(userLng, userLat, Object.keys(graph));

    let best = { distDriving: Infinity, distWalking: Infinity, length: 0, service: null, path: [] };

    servicePoints.forEach(s => {
        let matchesFilter = false;
        if (effectiveFilterType && s.type === effectiveFilterType) {
            matchesFilter = true;
        } else if (effectiveSearchTerm) {
            const nameMatches = s.name.toLowerCase().includes(effectiveSearchTerm);
            const typeMatches = s.type.toLowerCase().includes(effectiveSearchTerm);
            matchesFilter = nameMatches || typeMatches;
        }

        if (!matchesFilter) return;

        const [lat, lng] = s.coord;
        const targetNode = findClosestNode(lng, lat, Object.keys(graph));

        try {
            let drivingGraphForDijkstra = {};
            for (const fromNode in graph) {
                drivingGraphForDijkstra[fromNode] = {};
                for (const toNode in graph[fromNode]) {
                    drivingGraphForDijkstra[fromNode][toNode] = graph[fromNode][toNode].drivingTime;
                }
            }

            const path = dijkstra.find_path(drivingGraphForDijkstra, userNode, targetNode);
            
            let totalDrivingTimeForPath = 0;
            let totalWalkingTimeForPath = 0;
            let totalLengthForPath = 0;

            for (let i = 0; i < path.length - 1; i++) {
                const from = path[i], to = path[i + 1];
                const segmentData = graph[from][to];
                totalDrivingTimeForPath += segmentData.drivingTime;
                totalWalkingTimeForPath += segmentData.walkingTime;
                totalLengthForPath += edgeLengths[`${from}_${to}`] || 0;
            }

            if (totalDrivingTimeForPath < best.distDriving) {
                best = {
                    distDriving: totalDrivingTimeForPath,
                    distWalking: totalWalkingTimeForPath,
                    length: totalLengthForPath,
                    service: s,
                    path: path
                };
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
        
        let stepsHtml = "<hr><b></b><br>";
        for (let i = 0; i < best.path.length - 1; i++) {
            const from = best.path[i].split(',').map(Number).reverse();
            const to = best.path[i + 1].split(',').map(Number).reverse();
            const direction = getDirectionText(from, to);
            const dist = edgeLengths[`${best.path[i]}_${best.path[i + 1]}`] || 0;
            const segmentData = graph[best.path[i]][best.path[i+1]];
            const timeSegmentDriving = segmentData.drivingTime || 0;
            const timeSegmentWalking = segmentData.walkingTime || 0;

            // stepsHtml += `➡️ ${direction} لمسافة <b>${formatDistance(dist)}</b> (قيادة: <b>${formatTime(timeSegmentDriving)}</b>, مشي: <b>${formatTime(timeSegmentWalking)}</b>)<br>`;
        }
        // stepsHtml += `✅ الوصول إلى: <b>${best.service.name}</b>`;

        document.getElementById('info').innerHTML = `
            أقرب نقطة: <b>${best.service.name}</b><br>
            نوع الخدمة: <b>${best.service.type}</b><br>
            زمن الوصول التقريبي بالسيارة: <b>${formatTime(best.distDriving)}</b><br>
            زمن الوصول التقريبي بالاقدام: <b>${formatTime(best.distWalking)}</b><br>
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

// إضافة مستمعي الأحداث لزر البحث وحقل الإدخال عند تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchBtn').addEventListener('click', searchServices);

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', updateSuggestions); // استدعاء الدالة عند كل تغيير في الإدخال

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchServices();
            // إخفاء الاقتراحات بعد البحث بالضغط على Enter
            const suggestionsContainer = document.getElementById('suggestions-container');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }
        } else if (event.key === 'Escape' || searchInput.value === '') {
            // إذا ضغط المستخدم على Esc أو مسح حقل البحث، أعد عرض جميع نقاط الخدمة
            const typeFilterSelect = document.getElementById("typeFilter");
            displayServicePoints(typeFilterSelect.value);
            document.getElementById('info').textContent = 'جارٍ تحميل الخريطة...'; // أو رسالة افتراضية أخرى
            routeLayer.clearLayers();
            if (destinationMarker) map.removeLayer(destinationMarker);
            // إخفاء الاقتراحات عند مسح البحث أو Esc
            const suggestionsContainer = document.getElementById('suggestions-container');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }
        }
    });

    // إضافة مستمع لغلق الاقتراحات عند النقر خارجها
    document.addEventListener('click', (event) => {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer && !searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });

    // منطق التمدد والانقباض للأكورديون
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling; // المحتوى هو العنصر التالي للهيدر
            const toggleIcon = header.querySelector('.toggle-icon');

            // إغلاق جميع الأقسام الأخرى باستثناء القسم الحالي
            accordionHeaders.forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.classList.remove('active');
                    otherHeader.nextElementSibling.style.display = 'none';
                    otherHeader.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
                }
            });

            // تبديل حالة القسم الحالي
            header.classList.toggle('active');
            if (content.style.display === 'block') {
                content.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
            } else {
                content.style.display = 'block';
                toggleIcon.style.transform = 'rotate(180deg)'; // تدوير السهم
            }
        });
    });

    // اختياري: افتح القسم الأول (البحث عن خدمة) عند التحميل
    // يمكنك تعديل هذا ليناسب تفضيلاتك
    const searchHeader = document.getElementById('searchHeader');
    if (searchHeader) {
        searchHeader.click(); // يحاكي النقر لفتحها
    }
});


function generateMapLegendControl() {
    const legend = L.control({ position: 'topleft' });

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>مفتاح الخريطة:</h4>';

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
        const roadClassesMap = { // تم التأكد من وجود جميع الفئات التي قد تكون في بياناتك
            'motorway': 'طريق سريع',
            'highway': 'طريق سريع',
            'primary': 'طريق رئيسي',
            'primary_link': 'وصلة طريق رئيسي',
            'secondary': 'طريق ثانوي',
            'trunk': 'طريق جذعي',
            'trunk_link': 'وصلة طريق جذعي',
            'unclassified': 'طريق غير مصنف',
            'residential': 'طريق سكني',
            'footway': 'ممر للمشاة',
            'track': 'طريق ترابي',
            'default': 'أخرى/غير معروف'
        };

        const uniqueRoadClasses = new Set();
        roadsLayer.eachLayer(layer => {
            const properties = layer.feature?.properties || layer.feature?.attributes;
            // التحويل إلى أحرف صغيرة ضروري هنا للمطابقة مع المفاتيح في roadClassesMap
            const fclass = (properties?.fclass || 'default').toLowerCase(); 
            uniqueRoadClasses.add(fclass);
        });

        const sortedRoadClasses = Array.from(uniqueRoadClasses).sort();
        // تأكد من أن 'default' يظهر دائمًا في النهاية إذا كان موجودًا
        if (sortedRoadClasses.includes('default')) {
            sortedRoadClasses.splice(sortedRoadClasses.indexOf('default'), 1);
            sortedRoadClasses.push('default');
        }

        sortedRoadClasses.forEach(fclass => {
            const color = getRoadColor(fclass); // fclass هنا سيكون بأحرف صغيرة
            const displayName = roadClassesMap[fclass] || roadClassesMap['default'];
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




loadMap();