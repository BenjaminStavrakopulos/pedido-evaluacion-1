import os

from locust import HttpUser, between, task


def validate_health_response(response):
    if response.status_code != 200:
        response.failure(f"Expected 200, received {response.status_code}")


class MonsiteHealthUser(HttpUser):
    host = os.getenv("LOCUST_HOST", "http://127.0.0.1:3000")
    wait_time = between(1, 3)

    @task
    def check_health(self):
        with self.client.get("/health", name="GET /health", catch_response=True) as response:
            validate_health_response(response)