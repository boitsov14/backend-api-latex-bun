# Use Alpine as base image
FROM alpine:latest
# Install TeX
COPY --from=boitsov14/minimal-prooftree-latex:latest /usr/local/texlive /usr/local/texlive
RUN ln -sf /usr/local/texlive/*/bin/* /usr/local/bin/texlive
ENV PATH=/usr/local/bin/texlive:$PATH
# Install Ghostscript
RUN apk --no-cache add ghostscript
# Serve the binary
WORKDIR /app
COPY main .
ENV NODE_ENV=production
EXPOSE 8080
ENTRYPOINT ["./main"]
