// ============================================
 // KONFIGURASI
 // ============================================
 const CONFIG = {
     geojsonPath: './data/',
     pendudukFile: 'penduduk_kecamatan.geojson',
     jalanFile: 'jalan_utama.geojson',
     centerMap: [-7.450, 112.640],
     defaultZoom: 10
 };

 // ============================================
 // GLOBAL VARIABLES
 // ============================================
 let pendudukData = null;
 let jalanData = null;
 let pendudukLayer = L.layerGroup();
 let jalanLayer = L.layerGroup();
 let heatmapLayer = L.layerGroup();
 let heatmapVisible = false;
 let allKotaKabupaten = {};
 let allKecamatan = {};

 // ============================================
 // UTILITY FUNCTIONS
 // ============================================
 
 function showError(message) {
     const errorDiv = document.getElementById('errorMessage');
     errorDiv.textContent = '❌ ' + message;
     errorDiv.classList.add('show');
     console.error(message);
     setTimeout(() => errorDiv.classList.remove('show'), 5000);
 }

 function showSuccess(message) {
     const successDiv = document.getElementById('successMessage');
     successDiv.textContent = '✅ ' + message;
     successDiv.classList.add('show');
     console.log(message);
     setTimeout(() => successDiv.classList.remove('show'), 3000);
 }

 function toggleLoading(show) {
     document.getElementById('loading').classList.toggle('show', show);
 }

 function calculateArea(geometry) {
     if (geometry.type === 'MultiPolygon') {
         let totalArea = 0;
         geometry.coordinates.forEach(polygon => {
             totalArea += calculatePolygonArea(polygon[0]);
         });
         return totalArea;
     } else if (geometry.type === 'Polygon') {
         return calculatePolygonArea(geometry.coordinates[0]);
     }
     return 0;
 }

 function calculatePolygonArea(coords) {
     let area = 0;
     for (let i = 0; i < coords.length - 1; i++) {
         area += (coords[i][0] * coords[i+1][1]) - (coords[i+1][0] * coords[i][1]);
     }
     return Math.abs(area / 2) * 111 * 111;
 }

 // ============================================
 // INISIALISASI PETA
 // ============================================
 
 const map = L.map('map', {
     center: CONFIG.centerMap,
     zoom: CONFIG.defaultZoom,
     zoomControl: true
 });

 // ============================================
 // BASEMAP LAYERS
 // ============================================
 
 const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
     attribution: '© OpenStreetMap contributors',
     maxZoom: 19
 });

 const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
     attribution: '© Esri',
     maxZoom: 19
 });

 const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
     attribution: '© CARTO',
     maxZoom: 19
 });

 osmLayer.addTo(map);
 console.log('✅ Basemap dimuat');

 // ============================================
 // LOAD GEOJSON
 // ============================================
 
 async function loadGeoJSON(filename) {
     try {
         const url = `${CONFIG.geojsonPath}${filename}`;
         console.log(`🔍 Loading: ${url}`);
         
         const response = await fetch(url);
         
         if (!response.ok) {
             throw new Error(`HTTP ${response.status}: ${response.statusText}`);
         }
         
         const data = await response.json();
         
         if (!data.type || data.type !== 'FeatureCollection') {
             throw new Error('Format GeoJSON tidak valid!');
         }
         
         console.log(`✅ Loaded ${filename}: ${data.features.length} features`);
         return data;
     } catch (error) {
         console.error(`❌ Error ${filename}:`, error);
         showError(`Gagal memuat ${filename}: ${error.message}`);
         return null;
     }
 }

 // ============================================
 // STYLING
 // ============================================
 
 function getColor(penduduk) {
     return penduduk > 100000 ? '#800026' :
            penduduk > 75000  ? '#BD0026' :
            penduduk > 50000  ? '#E31A1C' :
            penduduk > 40000  ? '#FC4E2A' :
            penduduk > 30000  ? '#FD8D3C' :
                                '#FEB24C';
 }

 function styleFeature(feature) {
     const penduduk = feature.properties.Penduduk || 0;
     return {
         fillColor: getColor(penduduk),
         weight: 2,
         opacity: 1,
         color: 'white',
         dashArray: '3',
         fillOpacity: heatmapVisible ? 0.9 : 0.7
     };
 }

 // ============================================
 // INTERACTION
 // ============================================
 
 function highlightFeature(e) {
     const layer = e.target;
     layer.setStyle({
         weight: 5,
         color: '#666',
         dashArray: '',
         fillOpacity: 0.9
     });
     layer.bringToFront();
 }

 function resetHighlight(e) {
     const layer = e.target;
     layer.setStyle(styleFeature(layer.feature));
 }

 function zoomToFeature(e) {
     map.fitBounds(e.target.getBounds());
 }

 // ============================================
 // LOAD LAYERS
 // ============================================
 
 function loadPendudukLayer(filterKota = 'all', filterKec = 'all') {
     if (!pendudukData) return;

     pendudukLayer.clearLayers();
     heatmapLayer.clearLayers();
     
     let filteredData = {...pendudukData};
     let features = pendudukData.features;
     
     // Filter berdasarkan kota
     if (filterKota !== 'all') {
         features = features.filter(f => {
             const kota = f.properties.WADMKK || f.properties.WADMPR || '';
             return kota.includes(filterKota);
         });
     }
     
     // Filter berdasarkan kecamatan
     if (filterKec !== 'all') {
         features = features.filter(f => f.properties.NAMOBJ === filterKec);
     }
     
     filteredData.features = features;
     console.log(`🔍 Filter aktif - Menampilkan ${features.length} kecamatan`);

     // Load polygon layer
     const geoJsonLayer = L.geoJSON(filteredData, {
         style: styleFeature,
         onEachFeature: function(feature, layer) {
             layer.on({
                 mouseover: highlightFeature,
                 mouseout: resetHighlight,
                 click: zoomToFeature
             });

             const props = feature.properties;
             const namobj = props.NAMOBJ || 'Tidak diketahui';
             const kabupaten = props.WADMKK || props.WADMPR || '-';
             const penduduk = props.Penduduk || 0;
             const luas = calculateArea(feature.geometry).toFixed(2);
             const kepadatan = luas > 0 ? (penduduk / luas).toFixed(0) : 0;
             
             layer.bindPopup(`
                 <div>
                     <h3>📍 Kecamatan ${namobj}</h3>
                     <p><strong>Kabupaten/Kota:</strong> ${kabupaten}</p>
                     <p><strong>Provinsi:</strong> Jawa Timur</p>
                     <p><strong>Jumlah Penduduk:</strong> ${penduduk.toLocaleString('id-ID')} jiwa</p>
                     <p><strong>Luas (estimasi):</strong> ${luas} km²</p>
                     <p><strong>Kepadatan (estimasi):</strong> ${kepadatan} jiwa/km²</p>
                 </div>
             `);

             layer.bindTooltip(`${namobj} (${penduduk.toLocaleString('id-ID')} jiwa)`, {
                 permanent: false,
                 direction: 'center'
             });
         }
     });
     
     geoJsonLayer.addTo(pendudukLayer);
     
     // Create heatmap
     const heatData = [];
     features.forEach(feature => {
         if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
             const coords = feature.geometry.type === 'Polygon' 
                 ? feature.geometry.coordinates[0]
                 : feature.geometry.coordinates[0][0];
             
             let lat = 0, lng = 0;
             coords.forEach(coord => {
                 lng += coord[0];
                 lat += coord[1];
             });
             lat /= coords.length;
             lng /= coords.length;
             
             const intensity = (feature.properties.Penduduk || 0) / 10000;
             heatData.push([lat, lng, intensity]);
         }
     });
     
     if (heatData.length > 0) {
         L.heatLayer(heatData, {
             radius: 25,
             blur: 35,
             maxZoom: 13,
             max: 10,
             gradient: {
                 0.0: '#FEB24C',
                 0.3: '#FD8D3C',
                 0.5: '#FC4E2A',
                 0.7: '#E31A1C',
                 0.9: '#BD0026',
                 1.0: '#800026'
             }
         }).addTo(heatmapLayer);
     }
     
     // Auto zoom
     if (features.length > 0) {
         const bounds = geoJsonLayer.getBounds();
         map.fitBounds(bounds, { padding: [50, 50] });
     }
 }

 function loadJalanLayer(filterKota = 'all') {
     if (!jalanData) return;

     jalanLayer.clearLayers();
     
     let features = jalanData.features;
     
     if (filterKota !== 'all') {
         features = features.filter(f => {
             const kota = f.properties.WADMKK || '';
             return kota.includes(filterKota);
         });
     }

     L.geoJSON({type: 'FeatureCollection', features: features}, {
         style: function(feature) {
             const props = feature.properties;
             const remark = props.REMARK || '';
             
             let color = '#00AA00';
             let weight = 2;
             
             if (remark.includes('Arteri')) {
                 color = '#FF0000';
                 weight = 4;
             } else if (remark.includes('Kolektor')) {
                 color = '#0000FF';
                 weight = 3;
             }
             
             return {
                 color: color,
                 weight: weight,
                 opacity: 0.8
             };
         },
         onEachFeature: function(feature, layer) {
             const props = feature.properties;
             const nama = props.NAMOBJ || 'Jalan Tanpa Nama';
             const tipe = props.REMARK || 'Jalan Lokal';
             const panjang = ((props.SHAPE_Leng || 0) * 111).toFixed(2);
             
             layer.bindPopup(`
                 <div>
                     <h3>🛣️ ${nama}</h3>
                     <p><strong>Tipe:</strong> ${tipe}</p>
                     <p><strong>Panjang (estimasi):</strong> ${panjang} km</p>
                 </div>
             `);
         }
     }).addTo(jalanLayer);
     
     console.log(`✅ Layer jalan dimuat: ${features.length} segmen`);
 }

 // ============================================
 // POPULATE FILTERS
 // ============================================
 
 function populateFilters() {
     if (!pendudukData) return;

     // Extract unique kota/kabupaten dan kecamatan
     pendudukData.features.forEach(f => {
         const props = f.properties;
         const kota = props.WADMKK || props.WADMPR || '';
         const kec = props.NAMOBJ || '';
         
         if (kota) {
             if (!allKotaKabupaten[kota]) {
                 allKotaKabupaten[kota] = [];
             }
             if (kec && !allKotaKabupaten[kota].includes(kec)) {
                 allKotaKabupaten[kota].push(kec);
             }
             allKecamatan[kec] = kota;
         }
     });
     
     // Populate kota dropdown
     const kotaSelect = document.getElementById('filterKota');
     kotaSelect.innerHTML = '<option value="all">Semua Wilayah</option>';
     
     Object.keys(allKotaKabupaten).sort().forEach(kota => {
         const option = document.createElement('option');
         option.value = kota;
         option.textContent = kota;
         kotaSelect.appendChild(option);
     });
     
     updateKecamatanDropdown('all');
     console.log(`✅ Filter: ${Object.keys(allKotaKabupaten).length} kota/kabupaten`);
 }

 function updateKecamatanDropdown(selectedKota) {
     const kecSelect = document.getElementById('filterKecamatan');
     kecSelect.innerHTML = '<option value="all">Semua Kecamatan</option>';
     
     let kecamatanList = [];
     
     if (selectedKota === 'all') {
         kecamatanList = Object.keys(allKecamatan).sort();
     } else {
         kecamatanList = (allKotaKabupaten[selectedKota] || []).sort();
     }
     
     kecamatanList.forEach(kec => {
         const option = document.createElement('option');
         option.value = kec;
         option.textContent = kec;
         kecSelect.appendChild(option);
     });
     
     console.log(`✅ Kecamatan dropdown: ${kecamatanList.length} items`);
 }

 // ============================================
 // MAP CONTROLS
 // ============================================
 
 // Legend
 const legend = L.control({position: 'bottomright'});
 legend.onAdd = function() {
     const div = L.DomUtil.create('div', 'legend');
     const grades = [0, 30000, 40000, 50000, 75000, 100000];
     
     div.innerHTML = '<h4>Jumlah Penduduk</h4>';
     
     for (let i = 0; i < grades.length; i++) {
         div.innerHTML +=
             '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
             grades[i].toLocaleString('id-ID') + 
             (grades[i + 1] ? '&ndash;' + grades[i + 1].toLocaleString('id-ID') + '<br>' : '+');
     }
     
     div.innerHTML += '<br><strong>Jalan:</strong><br>';
     div.innerHTML += '<i style="background:#FF0000"></i> Arteri<br>';
     div.innerHTML += '<i style="background:#0000FF"></i> Kolektor<br>';
     div.innerHTML += '<i style="background:#00AA00"></i> Lokal';
     
     return div;
 };
 legend.addTo(map);

 // Coordinate Display
 const coordDisplay = L.control({position: 'bottomleft'});
 coordDisplay.onAdd = function() {
     this._div = L.DomUtil.create('div', 'coord-display');
     this._div.innerHTML = '<strong>Koordinat:</strong> Gerakkan mouse';
     return this._div;
 };
 coordDisplay.addTo(map);

 map.on('mousemove', function(e) {
     coordDisplay._div.innerHTML = `<strong>Lat:</strong> ${e.latlng.lat.toFixed(5)} | <strong>Lng:</strong> ${e.latlng.lng.toFixed(5)}`;
 });

 // Info Box
 const info = L.control({position: 'topright'});
 info.onAdd = function() {
     this._div = L.DomUtil.create('div', 'info-box');
     this._div.innerHTML = '<h4>📊 Info Peta</h4><p>Klik wilayah untuk zoom<br>Hover untuk detail</p>';
     return this._div;
 };
 info.addTo(map);

 // Layer Control
 pendudukLayer.addTo(map);
 jalanLayer.addTo(map);

 const baseMaps = {
     "OpenStreetMap": osmLayer,
     "Esri Satellite": esriSatellite,
     "Carto Light": cartoLight
 };

 const overlayMaps = {
     "Data Penduduk": pendudukLayer,
     "Jalan Utama": jalanLayer,
     "Heatmap Penduduk": heatmapLayer
 };

 L.control.layers(baseMaps, overlayMaps, {position: 'topleft'}).addTo(map);
 L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);

 // ============================================
 // EVENT LISTENERS
 // ============================================
 
 document.getElementById('filterKota').addEventListener('change', function(e) {
     const selectedKota = e.target.value;
     updateKecamatanDropdown(selectedKota);
     document.getElementById('filterKecamatan').value = 'all';
     loadPendudukLayer(selectedKota, 'all');
     loadJalanLayer(selectedKota);
 });

 document.getElementById('filterKecamatan').addEventListener('change', function(e) {
     const selectedKota = document.getElementById('filterKota').value;
     const selectedKec = e.target.value;
     loadPendudukLayer(selectedKota, selectedKec);
 });

 document.getElementById('resetView').addEventListener('click', function() {
     map.setView(CONFIG.centerMap, CONFIG.defaultZoom);
     document.getElementById('filterKota').value = 'all';
     document.getElementById('filterKecamatan').value = 'all';
     updateKecamatanDropdown('all');
     loadPendudukLayer('all', 'all');
     loadJalanLayer('all');
     console.log('🔄 View reset');
 });

 document.getElementById('toggleHeatmap').addEventListener('click', function() {
     heatmapVisible = !heatmapVisible;
     if (heatmapVisible) {
         map.addLayer(heatmapLayer);
         this.textContent = '🔥 Heatmap: ON';
         this.classList.add('active');
     } else {
         map.removeLayer(heatmapLayer);
         this.textContent = '🔥 Toggle Heatmap';
         this.classList.remove('active');
     }
     // Reload untuk update opacity
     const kota = document.getElementById('filterKota').value;
     const kec = document.getElementById('filterKecamatan').value;
     loadPendudukLayer(kota, kec);
 });

 // ============================================
 // MAIN INITIALIZATION
 // ============================================
 
 async function initializeMap() {
     toggleLoading(true);
     console.log('🚀 Inisialisasi dimulai...');

     try {
         pendudukData = await loadGeoJSON(CONFIG.pendudukFile);
         jalanData = await loadGeoJSON(CONFIG.jalanFile);

         if (pendudukData) {
             populateFilters();
             loadPendudukLayer();
             showSuccess(`Data penduduk: ${pendudukData.features.length} kecamatan dimuat`);
         }

         if (jalanData) {
             loadJalanLayer();
             showSuccess(`Data jalan: ${jalanData.features.length} segmen dimuat`);
         }

         if (!pendudukData && !jalanData) {
             showError('Tidak ada data yang berhasil dimuat!');
         }

     } catch (error) {
         console.error('Error:', error);
         showError('Error: ' + error.message);
     } finally {
         toggleLoading(false);
     }
 }

 // ============================================
 // START APPLICATION
 // ============================================
 
 initializeMap();
 console.log('🗺️ Aplikasi WebGIS siap!');
