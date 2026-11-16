-- EscabiARG: videos de prueba (misiones, prendas, infracciones, quebradas, ruleta)
--
-- La app graba videos de hasta 15 segundos con calidad ajustada (unos 3 MB),
-- en MP4 (iPhone y la mayoría de los Android) o WebM. Se guardan en la misma
-- carpeta privada que las fotos, con las mismas reglas de acceso.
-- El tope de 25 MB es por las dudas: un video de la app nunca llega a eso.

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id = 'trip-photos';
