export dd=$(date '+%Y%m%d%H%M')

docker build -t hub.gxdnr.local/langgenius/dify-web:1.13.3-$dd .
docker tag hub.gxdnr.local/langgenius/dify-web:1.13.3-$dd hub.gxdnr.local/langgenius/dify-web:latest

# docker push hub.gxdnr.local/langgenius/dify-web:1.13.3-$dd
# docker push hub.gxdnr.local/langgenius/dify-web:latest

docker save -o dify.tar hub.gxdnr.local/langgenius/dify-web:1.13.3-$dd
crane push dify.tar hub.gxdnr.local/langgenius/dify-web:1.13.3-$dd
