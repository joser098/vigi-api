-- MOCK CATALOGUE — datos de relleno para desarrollo, no son productos reales.
--
-- Todo lo insertado acá lleva {"mock": true} en details, así que se borra con:
--   delete from products where details @> '{"mock": true}';
--   delete from carrusel_images where link_url = 'mock';
--
-- Idempotente: se puede re-ejecutar.
--
-- power_type va en minúscula y sin acento a propósito: el facet compara por
-- igualdad, y cargar "Batería" lo dejaría devolviendo vacío sin ningún error.
--
-- Cada familia usa su propia ficha técnica (details para cámaras, kit_details
-- para kits, etc.), igual que espera services/types.ts en vigi-app.

delete from products where details @> '{"mock": true}';
delete from carrusel_images where link_url = 'mock';

insert into products
  (model, title, price, discount, has_promotion, is_active, category, provider,
   location, power_type, is_analogue, tags, thumbnail, description, gallery,
   details, dvr_details, portero_details, alarm_details, storage_details, kit_details)
values

  -- ---------- Cámaras interiores ----------
  ('EZ-C1C', 'Ezviz C1C Cámara Interior 1080p', 25000, 0, false, true,
   'camaras', 'Ezviz', 'interior', 'cableada', false,
   '{camara,interior,wifi,1080p}', 'https://vigi.orastudio.dev/catalog/ez-c1c.jpg',
   'Cámara interior Wi-Fi con visión nocturna y audio bidireccional.', 3,
   '{"mock": true, "type": "Domo", "resolution": "1080p", "night_vision": true, "night_range_distance": "12m", "conectivity": "Wi-Fi", "motion_sensor": true, "mobile_alert": true, "live_stream": true, "dimensions": {"height": "10cm", "width": "6cm", "depth": "6cm", "weight": "150g"}}',
   null, null, null, null, null),

  ('EZ-C6N', 'Ezviz C6N Domo Motorizada Interior', 32000, 15, true, true,
   'camaras', 'Ezviz', 'interior', 'cableada', false,
   '{camara,interior,domo,motorizada,wifi}', 'https://vigi.orastudio.dev/catalog/ez-c6n.jpg',
   'Domo motorizada con seguimiento automático y rotación 360°.', 4,
   '{"mock": true, "type": "Domo motorizada", "resolution": "1080p", "night_vision": true, "night_range_distance": "10m", "conectivity": "Wi-Fi", "motion_sensor": true, "mobile_alert": true, "alarm": true, "live_stream": true, "dimensions": {"height": "11cm", "width": "8cm", "depth": "8cm", "weight": "230g"}}',
   null, null, null, null, null),

  ('IM-IPC-A22', 'Imou Ranger 2 Interior 1080p', 38000, 0, false, true,
   'camaras', 'Imou', 'interior', 'cableada', false,
   '{camara,interior,motorizada,wifi}', 'https://vigi.orastudio.dev/catalog/im-a22.jpg',
   'Cámara motorizada con seguimiento de personas y privacidad mecánica.', 3,
   '{"mock": true, "type": "Domo motorizada", "resolution": "1080p", "night_vision": true, "night_range_distance": "10m", "conectivity": "Wi-Fi", "motion_sensor": true, "live_stream": true, "dimensions": {"height": "11cm", "width": "8cm", "depth": "8cm", "weight": "250g"}}',
   null, null, null, null, null),

  -- ---------- Cámaras exteriores cableadas ----------
  ('EZ-C3N', 'Ezviz C3N Bullet Exterior Color Nocturno', 41000, 0, false, true,
   'camaras', 'Ezviz', 'exterior', 'cableada', false,
   '{camara,exterior,bullet,wifi}', 'https://vigi.orastudio.dev/catalog/ez-c3n.jpg',
   'Bullet exterior IP67 con visión nocturna a color.', 4,
   '{"mock": true, "type": "Bullet", "resolution": "1080p", "night_vision": true, "night_range_distance": "30m", "conectivity": "Wi-Fi", "motion_sensor": true, "mobile_alert": true, "live_stream": true, "dimensions": {"height": "8cm", "width": "8cm", "depth": "16cm", "weight": "320g"}}',
   null, null, null, null, null),

  ('HK-DS2CD1023', 'Hikvision Bullet IP 2MP Exterior', 68000, 0, false, true,
   'camaras', 'Hikvision', 'exterior', 'cableada', false,
   '{camara,exterior,bullet,poe,ip}', 'https://vigi.orastudio.dev/catalog/hk-1023.jpg',
   'Bullet IP con alimentación PoE para instalaciones profesionales.', 2,
   '{"mock": true, "type": "Bullet", "resolution": "2MP", "night_vision": true, "night_range_distance": "30m", "conectivity": "Ethernet PoE", "motion_sensor": true, "live_stream": true, "dimensions": {"height": "7cm", "width": "7cm", "depth": "17cm", "weight": "400g"}}',
   null, null, null, null, null),

  ('IM-IPC-F22', 'Imou Bullet 2E Exterior 1080p', 45000, 0, false, true,
   'camaras', 'Imou', 'exterior', 'cableada', false,
   '{camara,exterior,bullet,wifi}', 'https://vigi.orastudio.dev/catalog/im-f22.jpg',
   'Bullet exterior Wi-Fi resistente a la intemperie.', 3,
   '{"mock": true, "type": "Bullet", "resolution": "1080p", "night_vision": true, "night_range_distance": "30m", "conectivity": "Wi-Fi", "motion_sensor": true, "mobile_alert": true, "live_stream": true, "dimensions": {"height": "7cm", "width": "7cm", "depth": "15cm", "weight": "300g"}}',
   null, null, null, null, null),

  -- ---------- Cámaras a batería ----------
  ('EZ-CB3', 'Ezviz CB3 Cámara a Batería Exterior', 78000, 20, true, true,
   'camaras', 'Ezviz', 'exterior', 'bateria', false,
   '{camara,exterior,bateria,wifi,inalambrica}', 'https://vigi.orastudio.dev/catalog/ez-cb3.jpg',
   'Totalmente inalámbrica: batería recargable y sin cables de datos.', 5,
   '{"mock": true, "type": "Bullet", "resolution": "2K", "night_vision": true, "night_range_distance": "15m", "conectivity": "Wi-Fi", "motion_sensor": true, "mobile_alert": true, "alarm": true, "live_stream": true, "battery_mah": 5200, "dimensions": {"height": "9cm", "width": "7cm", "depth": "12cm", "weight": "380g"}}',
   null, null, null, null, null),

  ('EZ-BC1C', 'Ezviz BC1C Kit Cámara a Batería + Base', 95000, 0, false, true,
   'camaras', 'Ezviz', 'exterior', 'bateria', false,
   '{camara,exterior,bateria,kit,inalambrica}', 'https://vigi.orastudio.dev/catalog/ez-bc1c.jpg',
   'Cámara a batería con base de carga y almacenamiento local.', 4,
   '{"mock": true, "type": "Bullet", "resolution": "2K", "night_vision": true, "night_range_distance": "15m", "conectivity": "Wi-Fi", "motion_sensor": true, "live_stream": true, "battery_mah": 10400, "dimensions": {"height": "9cm", "width": "7cm", "depth": "12cm", "weight": "410g"}}',
   null, null, null, null, null),

  -- ---------- Analógicas ----------
  ('HK-DS2CE16', 'Hikvision Bullet Analógica 1080p Exterior', 29000, 0, false, true,
   'camaras', 'Hikvision', 'exterior', 'cableada', true,
   '{camara,exterior,analogica,bullet}', 'https://vigi.orastudio.dev/catalog/hk-2ce16.jpg',
   'Bullet analógica con conector BNC, compatible con DVR.', 2,
   '{"mock": true, "type": "Bullet", "resolution": "1080p", "resolution_type": "Analógica HD", "night_vision": true, "night_range_distance": "20m", "conectivity": "BNC", "live_stream": false, "dimensions": {"height": "7cm", "width": "7cm", "depth": "16cm", "weight": "350g"}}',
   null, null, null, null, null),

  ('DH-HAC-B1A21', 'Dahua Bullet Analógica 1080p', 26500, 10, true, true,
   'camaras', 'Dahua', 'exterior', 'cableada', true,
   '{camara,exterior,analogica,bullet}', 'https://vigi.orastudio.dev/catalog/dh-b1a21.jpg',
   'Bullet analógica económica para ampliar instalaciones existentes.', 2,
   '{"mock": true, "type": "Bullet", "resolution": "1080p", "resolution_type": "Analógica HD", "night_vision": true, "night_range_distance": "20m", "conectivity": "BNC", "live_stream": false, "dimensions": {"height": "6cm", "width": "6cm", "depth": "15cm", "weight": "300g"}}',
   null, null, null, null, null),

  -- ---------- Alarmas ----------
  ('AJ-HUB2', 'Ajax Hub 2 Central de Alarma', 210000, 0, false, true,
   'alarmas', 'Ajax', null, null, false,
   '{alarma,central,hub,inalambrica}', 'https://vigi.orastudio.dev/catalog/aj-hub2.jpg',
   'Central de alarma con respaldo GSM y Ethernet.', 3,
   '{"mock": true}', null, null,
   '{"max_devices": 100, "gsm": true, "ethernet": true, "backup_battery": "15h", "zones": 9, "app_control": true}',
   null, null),

  ('AJ-MOTION', 'Ajax MotionProtect Sensor de Movimiento', 62000, 12, true, true,
   'alarmas', 'Ajax', 'interior', 'bateria', false,
   '{alarma,sensor,movimiento,inalambrico}', 'https://vigi.orastudio.dev/catalog/aj-motion.jpg',
   'Sensor PIR inalámbrico con inmunidad a mascotas.', 2,
   '{"mock": true}', null, null,
   '{"range": "12m", "battery_years": 5, "pet_immune": true, "wireless": true, "angle": "88"}',
   null, null),

  ('EZ-A1', 'Ezviz A1 Panel de Alarma Wi-Fi', 88000, 0, false, true,
   'alarmas', 'Ezviz', 'interior', 'cableada', false,
   '{alarma,panel,wifi}', 'https://vigi.orastudio.dev/catalog/ez-a1.jpg',
   'Panel de alarma Wi-Fi con sirena integrada.', 3,
   '{"mock": true}', null, null,
   '{"max_devices": 32, "wifi": true, "siren_db": 100, "app_control": true, "zones": 4}',
   null, null),

  -- ---------- Almacenamiento ----------
  ('WD-PURPLE-1TB', 'Disco WD Purple 1TB Videovigilancia', 52000, 0, false, true,
   'almacenamiento', 'Western Digital', null, null, false,
   '{disco,hdd,almacenamiento,videovigilancia}', 'https://vigi.orastudio.dev/catalog/wd-1tb.jpg',
   'Disco optimizado para grabación continua 24/7.', 1,
   '{"mock": true}', null, null, null,
   '{"capacity": "1TB", "type": "HDD 3.5", "rpm": 5400, "interface": "SATA 6Gb/s", "workload": "180TB/año", "cameras_max": 64}',
   null),

  ('WD-PURPLE-2TB', 'Disco WD Purple 2TB Videovigilancia', 78000, 10, true, true,
   'almacenamiento', 'Western Digital', null, null, false,
   '{disco,hdd,almacenamiento,videovigilancia}', 'https://vigi.orastudio.dev/catalog/wd-2tb.jpg',
   'Disco optimizado para grabación continua 24/7, mayor capacidad.', 1,
   '{"mock": true}', null, null, null,
   '{"capacity": "2TB", "type": "HDD 3.5", "rpm": 5400, "interface": "SATA 6Gb/s", "workload": "180TB/año", "cameras_max": 64}',
   null),

  ('SD-32GB', 'MicroSD 32GB Clase 10 para Cámaras', 9500, 0, false, true,
   'almacenamiento', 'Sandisk', null, null, false,
   '{microsd,memoria,almacenamiento}', 'https://vigi.orastudio.dev/catalog/sd-32.jpg',
   'Tarjeta microSD para grabación local en cámaras Wi-Fi.', 1,
   '{"mock": true}', null, null, null,
   '{"capacity": "32GB", "type": "microSDHC", "class": 10, "read_speed": "80MB/s", "write_speed": "20MB/s"}',
   null),

  -- ---------- Kits ----------
  ('KIT-4CAM-HK', 'Kit Hikvision 4 Cámaras + DVR 4 Canales', 320000, 18, true, true,
   'kits', 'Hikvision', 'exterior', 'cableada', true,
   '{kit,dvr,4canales,analogico}', 'https://vigi.orastudio.dev/catalog/kit-hk4.jpg',
   'Kit completo listo para instalar: 4 cámaras, DVR, fuente y cables.', 5,
   '{"mock": true}',
   '{"channels": 4, "max_resolution": "1080p", "outputs": ["HDMI", "VGA"], "hdd_bays": 1, "hdd_max": "6TB", "remote_view": true}',
   null, null, null,
   '{"cameras": 4, "includes": ["DVR 4 canales", "4 cámaras bullet", "Fuente", "Cables 18m"], "camera_type": "Bullet analógica", "resolution": "1080p", "mounting": "Exterior", "hdd_included": false}'),

  ('KIT-2CAM-EZ', 'Kit Ezviz 2 Cámaras Wi-Fi + NVR', 150000, 0, false, true,
   'kits', 'Ezviz', 'exterior', 'cableada', false,
   '{kit,nvr,2canales,wifi}', 'https://vigi.orastudio.dev/catalog/kit-ez2.jpg',
   'Kit Wi-Fi de 2 cámaras con NVR y app móvil.', 4,
   '{"mock": true}',
   '{"channels": 4, "max_resolution": "4MP", "outputs": ["HDMI"], "hdd_bays": 1, "hdd_max": "4TB", "remote_view": true}',
   null, null, null,
   '{"cameras": 2, "includes": ["NVR 4 canales", "2 cámaras Wi-Fi", "Fuente"], "camera_type": "Bullet Wi-Fi", "resolution": "1080p", "mounting": "Exterior", "hdd_included": false}'),

  -- ---------- Porteros ----------
  ('DH-VTO2111', 'Dahua Portero Eléctrico IP con Cámara', 135000, 0, false, true,
   'porteros', 'Dahua', 'exterior', 'cableada', false,
   '{portero,ip,videoportero}', 'https://vigi.orastudio.dev/catalog/dh-vto2111.jpg',
   'Videoportero IP con apertura remota desde el celular.', 3,
   '{"mock": true}', null,
   '{"resolution": "1MP", "poe": true, "angle": "120", "night_vision": true, "door_release": true, "app_control": true, "material": "Aluminio"}',
   null, null, null),

  ('HK-DS-KV6113', 'Hikvision Videoportero IP 2MP', 158000, 0, false, true,
   'porteros', 'Hikvision', 'exterior', 'cableada', false,
   '{portero,ip,videoportero}', 'https://vigi.orastudio.dev/catalog/hk-kv6113.jpg',
   'Videoportero IP gran angular con visión nocturna.', 3,
   '{"mock": true}', null,
   '{"resolution": "2MP", "poe": true, "angle": "180", "night_vision": true, "door_release": true, "app_control": true, "material": "Aleación de zinc"}',
   null, null, null),

  -- ---------- Discontinuado: verifica que is_active filtra de verdad ----------
  ('EZ-C1C-V1', 'Ezviz C1C v1 (discontinuado)', 19000, 0, false, false,
   'camaras', 'Ezviz', 'interior', 'cableada', false,
   '{camara,interior,discontinuado}', 'https://vigi.orastudio.dev/catalog/ez-c1c-v1.jpg',
   'Versión anterior, fuera de catálogo.', 1,
   '{"mock": true, "type": "Domo", "resolution": "720p", "night_vision": true, "conectivity": "Wi-Fi"}',
   null, null, null, null, null);

insert into carrusel_images (image_url, link_url, position, is_active) values
  ('https://vigi.orastudio.dev/carrusel/promo-baterias.jpg', 'mock', 1, true),
  ('https://vigi.orastudio.dev/carrusel/kits-instalacion.jpg', 'mock', 2, true),
  ('https://vigi.orastudio.dev/carrusel/alarmas-ajax.jpg', 'mock', 3, true);
