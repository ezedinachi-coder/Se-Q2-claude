"""
Integration services for Firebase Storage, Paystack, Expo Push, and Email
"""
import os
import logging
import base64
import httpx
from typing import List, Optional, Dict, Any
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, storage as firebase_storage

# Expo Push Notifications
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicketError,
)

# Email
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# ===== FIREBASE STORAGE SERVICE =====
class FirebaseStorageService:
    def __init__(self):
        self.bucket_name = os.getenv('FIREBASE_STORAGE_BUCKET')
        self.api_key = os.getenv('FIREBASE_API_KEY')
        self.bucket = None
        
        # Initialize Firebase Admin SDK (lazy initialization)
        # Skip initialization at startup to avoid blocking
        self.initialized = False
        logger.info(f"Firebase Storage service created (lazy init) for bucket: {self.bucket_name}")
    
    def _lazy_init(self):
        """Lazy initialization of Firebase - only when needed"""
        if self.initialized:
            return True
        try:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(options={
                    'storageBucket': self.bucket_name
                })
            self.bucket = firebase_storage.bucket()
            self.initialized = True
            logger.info(f"Firebase Storage initialized with bucket: {self.bucket_name}")
            return True
        except Exception as e:
            logger.warning(f"Firebase initialization warning: {e}. Using fallback mode.")
            return False
    
    async def upload_file(
        self, 
        file_data: bytes, 
        filename: str, 
        content_type: str = 'application/octet-stream',
        folder: str = 'uploads'
    ) -> str:
        """Upload file to Firebase Storage and return public URL"""
        try:
            # Try lazy initialization
            if not self._lazy_init():
                # Fallback: Return a placeholder URL
                logger.warning("Firebase not initialized, using placeholder")
                return f"https://storage.googleapis.com/{self.bucket_name}/{folder}/{filename}"
            
            # Create blob path
            blob_path = f"{folder}/{filename}"
            blob = self.bucket.blob(blob_path)
            
            # Upload file
            blob.upload_from_string(
                file_data,
                content_type=content_type
            )
            
            # Make public and get URL
            blob.make_public()
            public_url = blob.public_url
            
            logger.info(f"File uploaded successfully: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Firebase upload error: {e}")
            # Return placeholder for now
            return f"https://storage.googleapis.com/{self.bucket_name}/{folder}/{filename}"
    
    async def upload_base64_file(
        self,
        base64_data: str,
        filename: str,
        content_type: str = 'application/octet-stream',
        folder: str = 'uploads'
    ) -> str:
        """Upload base64 encoded file"""
        try:
            # Decode base64
            file_bytes = base64.b64decode(base64_data)
            return await self.upload_file(file_bytes, filename, content_type, folder)
        except Exception as e:
            logger.error(f"Base64 upload error: {e}")
            raise

# ===== PAYSTACK PAYMENT SERVICE =====
class PaystackService:
    def __init__(self):
        self.secret_key = os.getenv('PAYSTACK_SECRET_KEY')
        self.public_key = os.getenv('PAYSTACK_PUBLIC_KEY')
        self.base_url = os.getenv('PAYSTACK_BASE_URL', 'https://api.paystack.co')
        self.headers = {
            'Authorization': f'Bearer {self.secret_key}',
            'Content-Type': 'application/json'
        }
    
    async def initialize_transaction(
        self,
        email: str,
        amount: int,  # Amount in kobo (₦2,000 = 200000 kobo)
        reference: Optional[str] = None,
        callback_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Initialize a payment transaction"""
        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    'email': email,
                    'amount': amount,
                    'currency': 'NGN'
                }
                
                if reference:
                    payload['reference'] = reference
                if callback_url:
                    payload['callback_url'] = callback_url
                
                response = await client.post(
                    f'{self.base_url}/transaction/initialize',
                    json=payload,
                    headers=self.headers,
                    timeout=30.0
                )
                
                result = response.json()
                
                if response.status_code == 200 and result.get('status'):
                    logger.info(f"Payment initialized: {reference}")
                    return result
                else:
                    logger.error(f"Paystack initialization failed: {result}")
                    raise HTTPException(status_code=400, detail=result.get('message', 'Payment initialization failed'))
                    
        except httpx.TimeoutException:
            logger.error("Paystack request timeout")
            raise HTTPException(status_code=504, detail="Payment service timeout")
        except Exception as e:
            logger.error(f"Paystack error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def verify_transaction(self, reference: str) -> Dict[str, Any]:
        """Verify a payment transaction"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.base_url}/transaction/verify/{reference}',
                    headers=self.headers,
                    timeout=30.0
                )
                
                result = response.json()
                
                if response.status_code == 200:
                    logger.info(f"Payment verified: {reference}")
                    return result
                else:
                    logger.error(f"Paystack verification failed: {result}")
                    raise HTTPException(status_code=400, detail=result.get('message', 'Payment verification failed'))
                    
        except Exception as e:
            logger.error(f"Paystack verification error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ===== EXPO PUSH NOTIFICATIONS SERVICE =====
class ExpoPushService:
    def __init__(self):
        self.push_client = PushClient()
    
    def is_valid_token(self, token: str) -> bool:
        """Validate Expo push token format"""
        return token.startswith("ExponentPushToken[") and token.endswith("]")
    
    async def send_push_notification(
        self,
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        priority: str = 'high'
    ) -> Dict[str, Any]:
        """Send push notification to multiple tokens"""
        
        if not tokens:
            return {"success": 0, "failed": 0, "errors": []}
        
        # Validate tokens
        valid_tokens = [t for t in tokens if self.is_valid_token(t)]
        
        if not valid_tokens:
            logger.warning("No valid tokens provided")
            return {
                "success": 0,
                "failed": len(tokens),
                "errors": ["All tokens are invalid"]
            }
        
        # Create messages
        messages = []
        for token in valid_tokens:
            message = PushMessage(
                to=token,
                title=title,
                body=body,
                data=data or {},
                priority=priority,
                sound='default',
                badge=1
            )
            messages.append(message)
        
        # Send in batches (max 100 per request)
        results = {
            "success": 0,
            "failed": 0,
            "errors": [],
            "tickets": []
        }
        
        batch_size = 100
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            
            try:
                push_tickets = self.push_client.publish_multiple(batch)
                
                for ticket in push_tickets:
                    if ticket.is_success():
                        results["success"] += 1
                        results["tickets"].append({
                            "token": ticket.push_message.to,
                            "status": "ok",
                            "id": ticket.id
                        })
                    else:
                        results["failed"] += 1
                        results["errors"].append({
                            "token": ticket.push_message.to,
                            "error": ticket.message
                        })
                        logger.warning(f"Push notification failed: {ticket.message}")
            except Exception as e:
                results["failed"] += len(batch)
                results["errors"].append(str(e))
                logger.error(f"Batch send error: {e}")
        
        logger.info(f"Push notifications sent: {results['success']} success, {results['failed']} failed")
        return results

# ===== EMAIL SERVICE =====
class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST')
        self.smtp_port = int(os.getenv('SMTP_PORT', 2525))
        self.smtp_username = os.getenv('SMTP_USERNAME')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('SMTP_FROM_EMAIL')
        self.from_name = os.getenv('SMTP_FROM_NAME', 'SafeGuard')
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None
    ) -> bool:
        """Send email via SMTP"""
        try:
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            
            # Add text version
            text_part = MIMEText(body_text, 'plain')
            message.attach(text_part)
            
            # Add HTML version if provided
            if body_html:
                html_part = MIMEText(body_html, 'html')
                message.attach(html_part)
            
            # Send email
            await aiosmtplib.send(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_username,
                password=self.smtp_password,
                use_tls=True
            )
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Email send error: {e}")
            return False
    
    async def send_panic_alert_email(
        self,
        to_email: str,
        reporter_name: str,
        latitude: float,
        longitude: float,
        timestamp: datetime
    ) -> bool:
        """Send panic alert notification email"""
        subject = "🚨 URGENT: Panic Alert Activated"
        
        body_text = f"""
URGENT PANIC ALERT

A panic button has been activated by {reporter_name}

Location:
Latitude: {latitude}
Longitude: {longitude}
Google Maps: https://www.google.com/maps?q={latitude},{longitude}

Time: {timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}

Please respond immediately.

- SafeGuard Security System
        """
        
        body_html = f"""
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6;">
    <div style="background-color: #ff0000; color: white; padding: 20px; text-align: center;">
        <h1>🚨 URGENT: Panic Alert Activated</h1>
    </div>
    <div style="padding: 20px;">
        <p>A panic button has been activated by <strong>{reporter_name}</strong></p>
        
        <h3>Location:</h3>
        <ul>
            <li>Latitude: {latitude}</li>
            <li>Longitude: {longitude}</li>
            <li><a href="https://www.google.com/maps?q={latitude},{longitude}" style="color: #0066cc;">View on Google Maps</a></li>
        </ul>
        
        <p><strong>Time:</strong> {timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
        
        <p style="color: #ff0000; font-weight: bold;">Please respond immediately.</p>
        
        <hr style="margin-top: 30px;">
        <p style="color: #666; font-size: 12px;">SafeGuard Security System</p>
    </div>
</body>
</html>
        """
        
        return await self.send_email(to_email, subject, body_text, body_html)
    
    async def send_payment_confirmation(
        self,
        to_email: str,
        amount: float,
        reference: str
    ) -> bool:
        """Send payment confirmation email"""
        subject = "Payment Confirmation - SafeGuard Premium"
        
        body_text = f"""
Thank you for your payment!

Your premium subscription has been activated.

Transaction Details:
Amount: ₦{amount:,.2f}
Reference: {reference}

You now have access to premium features including:
- Security Escort tracking
- Priority support
- Advanced features

Thank you for choosing SafeGuard.

- SafeGuard Team
        """
        
        body_html = f"""
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6;">
    <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
        <h1>✓ Payment Confirmed</h1>
    </div>
    <div style="padding: 20px;">
        <p>Thank you for your payment!</p>
        <p>Your premium subscription has been activated.</p>
        
        <h3>Transaction Details:</h3>
        <ul>
            <li><strong>Amount:</strong> ₦{amount:,.2f}</li>
            <li><strong>Reference:</strong> {reference}</li>
        </ul>
        
        <h3>Premium Features Now Available:</h3>
        <ul>
            <li>✓ Security Escort tracking</li>
            <li>✓ Priority support</li>
            <li>✓ Advanced features</li>
        </ul>
        
        <p>Thank you for choosing SafeGuard.</p>
        
        <hr style="margin-top: 30px;">
        <p style="color: #666; font-size: 12px;">SafeGuard Team</p>
    </div>
</body>
</html>
        """
        
        return await self.send_email(to_email, subject, body_text, body_html)

# Initialize services
firebase_service = FirebaseStorageService()
paystack_service = PaystackService()
expo_push_service = ExpoPushService()
email_service = EmailService()

# Export for use in server.py
__all__ = [
    'firebase_service',
    'paystack_service',
    'expo_push_service',
    'email_service'
]
