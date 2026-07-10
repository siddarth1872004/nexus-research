# Step 1: Use an official light Python image as the starting base
FROM python:3.11-slim

# Step 2: Set the folder inside the Docker container where our files will go
WORKDIR /app

# Step 3: Copy the setup config and install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Step 4: Copy the rest of our project files
COPY . .

# Step 5: Inform Docker that the application will listen on port 8000
EXPOSE 8000

# Step 6: Start the FastAPI server using uvicorn when the box runs
CMD ["uvicorn", "nexus.web.app:app", "--host", "0.0.0.0", "--port", "8000"]
