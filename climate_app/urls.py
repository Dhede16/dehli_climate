from django.urls import path
from . import views

urlpatterns = [
    path('',          views.index,   name='index'),
    path('api/data/', views.api_data, name='api_data'),
    path('api/impute/', views.api_impute, name='api_impute'),
    path('api/download/', views.api_download, name='api_download')
]
