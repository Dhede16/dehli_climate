from django.urls import path, include

urlpatterns = [
    path('', include('climate_app.urls')),
]
